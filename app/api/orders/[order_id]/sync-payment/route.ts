/**
 * POST /api/orders/[order_id]/sync-payment
 *
 * Called by the client tracker after a Stripe redirect (?payment=success) to
 * confirm the session server-side and process the payment even if the Stripe
 * webhook hasn't fired yet. Safe to call multiple times — idempotent.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/payments/stripe";
import { createSupplierTransfer } from "@/lib/payments/supplier-transfer";

export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  // Auth: Bearer token first, cookie fallback
  const admin = createAdminClient();
  let user: { id: string; email?: string | null } | null = null;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data.user) user = data.user;
  }
  if (!user) {
    const serverClient = createServerClient();
    const { data: { user: cookieUser } } = await serverClient.auth.getUser();
    user = cookieUser ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find all pending Stripe payments for this order
  const { data: pendingPayments } = await admin
    .from("payments")
    .select("id, invoice_id, order_id, tenant_id, amount, stripe_checkout_session_id")
    .eq("order_id", params.order_id)
    .eq("method", "stripe")
    .eq("status", "pending")
    .not("stripe_checkout_session_id", "is", null);

  if (!pendingPayments || pendingPayments.length === 0) {
    console.log(`[sync-payment] no pending Stripe payments for order ${params.order_id}`);
    return NextResponse.json({ synced: false });
  }

  let synced = false;

  for (const payment of pendingPayments) {
    const sessionId = payment.stripe_checkout_session_id as string | null;
    if (!sessionId || !payment.invoice_id) continue;

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        console.log(`[sync-payment] session ${sessionId} not yet paid (status=${session.payment_status})`);
        continue;
      }

      console.log(`[sync-payment] confirming paid session ${sessionId} for order ${params.order_id}`);

      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as { id: string } | null)?.id ?? null;

      // Mark payment row as paid
      await admin.from("payments")
        .update({ status: "paid", ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}) })
        .eq("id", payment.id);

      // Recompute invoice status and advance order stage (same logic as webhook)
      await processInvoice(payment.invoice_id as string, payment.order_id as string, admin);

      // Automatically pay supplier their 90% cut (idempotent — skips if already paid)
      const isDeposit = session.metadata?.pay_deposit === "true";
      await createSupplierTransfer(payment.order_id as string, Number(payment.amount), paymentIntentId, isDeposit, admin).catch(
        (err) => console.error("[sync-payment] supplier transfer failed:", err)
      );

      synced = true;
    } catch (err) {
      console.error("[sync-payment] error processing session:", sessionId, err);
    }
  }

  return NextResponse.json({ synced });
}

async function processInvoice(
  invoiceId: string,
  orderId: string,
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
) {
  const { data: invoice } = await admin
    .from("invoices")
    .select("total_amount, deposit_amount, status")
    .eq("id", invoiceId)
    .single();
  if (!invoice) {
    console.error("[sync-payment] invoice not found:", invoiceId);
    return;
  }

  const { data: payments } = await admin
    .from("payments")
    .select("amount, status")
    .eq("invoice_id", invoiceId)
    .eq("status", "paid");

  const paid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

  let newStatus: string;
  if (paid >= invoice.total_amount) {
    newStatus = "paid";
  } else if (paid >= invoice.deposit_amount && invoice.deposit_amount > 0) {
    newStatus = "partially_paid";
  } else {
    newStatus = "pending_payment";
  }

  const paymentType = paid >= invoice.total_amount ? "full" : paid >= invoice.deposit_amount ? "deposit" : "partial";
  console.log(`[sync-payment] invoice ${invoiceId}: type=${paymentType} ${invoice.status} → ${newStatus} (paid=${paid}, total=${invoice.total_amount}, deposit=${invoice.deposit_amount})`);

  const { error: invErr } = await admin.from("invoices").update({ status: newStatus }).eq("id", invoiceId);
  if (invErr) console.error("[sync-payment] invoice update failed:", invErr);

  if (newStatus === "paid") {
    const { error: e } = await admin.from("orders").update({ deposit_paid: true, balance_paid: true }).eq("id", orderId);
    if (e) console.error("[sync-payment] order flags update failed:", e);
    else console.log(`[sync-payment] order ${orderId}: deposit_paid=true balance_paid=true`);
  } else if (newStatus === "partially_paid") {
    const { error: e } = await admin.from("orders").update({ deposit_paid: true }).eq("id", orderId);
    if (e) console.error("[sync-payment] order deposit_paid update failed:", e);
    else console.log(`[sync-payment] order ${orderId}: deposit_paid=true`);
  }

  // Advance stage
  if (newStatus === "partially_paid" || newStatus === "paid") {
    const { data: ord } = await admin.from("orders").select("stage, tenant_id").eq("id", orderId).single();
    if (!ord) return;

    let nextStage: string | null = null;
    let note = "";

    if (ord.stage === "production_files_prep") {
      nextStage = "sent_to_supplier";
      note = newStatus === "partially_paid"
        ? "Production deposit paid — order sent to supplier"
        : "Full production payment received — order sent to supplier";
    } else if (ord.stage === "sent_to_supplier" || ord.stage === "files_sent") {
      nextStage = "first_piece_in_progress";
      note = "Deposit confirmed — order released to first piece production";
    } else if (newStatus === "paid" && ord.stage === "qc_verified") {
      nextStage = "shipped";
      note = "Final balance paid — order released for shipment";
    }

    if (nextStage) {
      console.log(`[sync-payment] advancing order ${orderId}: ${ord.stage} → ${nextStage}`);
      const { error: stageErr } = await admin.from("orders").update({ stage: nextStage }).eq("id", orderId);
      if (stageErr) console.error("[sync-payment] stage update failed:", stageErr);
      await admin.from("stage_log").insert({
        order_id: orderId, tenant_id: ord.tenant_id,
        from_stage: ord.stage, to_stage: nextStage,
        changed_by: "system", note,
      }).catch((err) => console.error("[sync-payment] stage_log insert failed:", err));
    }
  }
}
