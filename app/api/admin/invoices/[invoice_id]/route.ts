import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

type InvoiceStatus =
  | "draft" | "sent" | "pending_payment" | "pending_verification"
  | "partially_paid" | "paid" | "failed" | "canceled";

type PaymentStatus = "pending" | "pending_verification" | "paid" | "failed" | "canceled";

/**
 * PATCH /api/admin/invoices/[invoice_id]
 * Admin controls: update invoice status, mark payments, edit bank details, etc.
 *
 * Actions:
 *   set_status          — change invoice status directly
 *   verify_payment      — mark a specific payment as paid and refresh invoice
 *   reject_payment      — mark a payment as failed
 *   update_invoice      — update total/deposit/notes/bank details
 *   update_bank_details — update bank transfer instructions
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { invoice_id: string } },
) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  // Verify invoice belongs to this tenant
  const { data: invoice } = await admin
    .from("invoices")
    .select("id, order_id, total_amount, deposit_amount, status")
    .eq("id", params.invoice_id)
    .eq("tenant_id", ctx.tenant.id)
    .single();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { action } = body;

  // ── set_status ─────────────────────────────────────────────────────────────
  if (action === "set_status") {
    const { status } = body as { status: InvoiceStatus; admin_notes?: string };
    if (!status) return NextResponse.json({ error: "status is required" }, { status: 400 });

    await admin
      .from("invoices")
      .update({
        status,
        ...(body.admin_notes !== undefined && { admin_notes: body.admin_notes as string }),
      })
      .eq("id", invoice.id);

    // If marking as paid, also flip orders flags
    if (status === "paid") {
      await admin.from("orders").update({ deposit_paid: true, balance_paid: true }).eq("id", invoice.order_id);
    } else if (status === "partially_paid") {
      await admin.from("orders").update({ deposit_paid: true }).eq("id", invoice.order_id);
    }

    return NextResponse.json({ success: true, status });
  }

  // ── verify_payment ─────────────────────────────────────────────────────────
  if (action === "verify_payment") {
    const { payment_id, admin_note } = body as { payment_id: string; admin_note?: string };
    if (!payment_id) return NextResponse.json({ error: "payment_id is required" }, { status: 400 });

    // Confirm payment belongs to this invoice
    const { data: payment } = await admin
      .from("payments")
      .select("id, amount, invoice_id")
      .eq("id", payment_id)
      .eq("invoice_id", invoice.id)
      .single();
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    await admin.from("payments").update({
      status:      "paid",
      verified_by: ctx.userId,
      verified_at: new Date().toISOString(),
      ...(admin_note ? { admin_note } : {}),
    }).eq("id", payment_id);

    // Recompute invoice status
    const { data: allPayments } = await admin
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoice.id)
      .eq("status", "paid");

    const totalPaid = (allPayments ?? []).reduce((s, p) => s + Number(p.amount), 0);

    let newInvoiceStatus: InvoiceStatus;
    if (totalPaid >= invoice.total_amount) {
      newInvoiceStatus = "paid";
    } else if (invoice.deposit_amount > 0 && totalPaid >= invoice.deposit_amount) {
      newInvoiceStatus = "partially_paid";
    } else {
      newInvoiceStatus = "pending_verification";
    }

    await admin.from("invoices").update({ status: newInvoiceStatus }).eq("id", invoice.id);

    if (newInvoiceStatus === "paid") {
      await admin.from("orders").update({ deposit_paid: true, balance_paid: true }).eq("id", invoice.order_id);
    } else if (newInvoiceStatus === "partially_paid") {
      await admin.from("orders").update({ deposit_paid: true }).eq("id", invoice.order_id);
    }

    return NextResponse.json({ success: true, invoice_status: newInvoiceStatus });
  }

  // ── reject_payment ─────────────────────────────────────────────────────────
  if (action === "reject_payment") {
    const { payment_id, admin_note } = body as { payment_id: string; admin_note?: string };
    if (!payment_id) return NextResponse.json({ error: "payment_id is required" }, { status: 400 });

    await admin.from("payments").update({
      status:     "failed" as PaymentStatus,
      admin_note: admin_note ?? null,
    }).eq("id", payment_id).eq("invoice_id", invoice.id);

    // Revert invoice to pending if it was pending_verification
    if (invoice.status === "pending_verification") {
      await admin.from("invoices").update({ status: "pending_payment" }).eq("id", invoice.id);
    }

    return NextResponse.json({ success: true });
  }

  // ── update_invoice ─────────────────────────────────────────────────────────
  if (action === "update_invoice") {
    const updates = body as {
      total_amount?: number;
      deposit_amount?: number;
      admin_notes?: string;
      card_enabled?: boolean;
    };

    const patch: Record<string, unknown> = {};
    if (updates.total_amount   != null)  patch.total_amount   = updates.total_amount;
    if (updates.deposit_amount != null)  patch.deposit_amount = updates.deposit_amount;
    if (updates.admin_notes    != null)  patch.admin_notes    = updates.admin_notes;
    if (updates.card_enabled   != null)  patch.card_enabled   = updates.card_enabled;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error } = await admin
      .from("invoices")
      .update(patch)
      .eq("id", invoice.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ invoice: updated });
  }

  // ── update_bank_details ────────────────────────────────────────────────────
  if (action === "update_bank_details") {
    const details = body as {
      bank_name?: string;
      bank_routing?: string;
      bank_account?: string;
      bank_swift?: string;
      bank_beneficiary?: string;
    };

    const { data: updated, error } = await admin
      .from("invoices")
      .update({
        bank_name:        details.bank_name        ?? null,
        bank_routing:     details.bank_routing     ?? null,
        bank_account:     details.bank_account     ?? null,
        bank_swift:       details.bank_swift       ?? null,
        bank_beneficiary: details.bank_beneficiary ?? null,
      })
      .eq("id", invoice.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ invoice: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
