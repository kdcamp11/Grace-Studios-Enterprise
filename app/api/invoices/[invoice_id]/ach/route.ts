import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * POST /api/invoices/[invoice_id]/ach
 * Client indicates they have initiated a bank transfer.
 * Sets invoice status to pending_verification; creates a payment row.
 *
 * Body: { amount?, method?: "ach"|"wire" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { invoice_id: string } },
) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("*, orders(client_id, clients(email))")
    .eq("id", params.invoice_id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
  }

  // Verify caller is the client
  const order = invoice.orders as { client_id: string; clients: { email: string } | { email: string }[] } | null;
  const clientEmail = order
    ? (Array.isArray(order.clients) ? order.clients[0] : order.clients as { email: string } | null)?.email
    : null;

  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  if (!isAdmin && clientEmail?.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    method?: "ach" | "wire";
    amount?: number;
    pay_deposit?: boolean;
  };

  const method   = body.method ?? "ach";
  const payDeposit = !!body.pay_deposit && invoice.deposit_amount > 0;
  const amount   = body.amount ?? (payDeposit ? invoice.deposit_amount : invoice.total_amount);

  // Insert payment record
  const { error: payError } = await admin.from("payments").insert({
    tenant_id:  tenant.id,
    invoice_id: invoice.id,
    order_id:   invoice.order_id,
    method,
    amount,
    status:     "pending_verification",
  });
  if (payError) return NextResponse.json({ error: payError.message }, { status: 500 });

  // Update invoice status
  const newStatus = invoice.status === "partially_paid" ? "partially_paid" : "pending_verification";
  await admin
    .from("invoices")
    .update({ status: newStatus })
    .eq("id", invoice.id);

  return NextResponse.json({ success: true, status: newStatus });
}
