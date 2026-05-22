import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * GET /api/invoices/[invoice_id]
 * Returns invoice + its payments.
 * Accessible to the owning client OR admin.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { invoice_id: string } },
) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const admin = createAdminClient();

  const { data: invoice, error } = await admin
    .from("invoices")
    .select("*, payments(*)")
    .eq("id", params.invoice_id)
    .eq("tenant_id", tenant.id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Verify access: admin OR the client who owns the order
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  if (!isAdmin) {
    const { data: order } = await admin
      .from("orders")
      .select("client_id, clients(email)")
      .eq("id", invoice.order_id)
      .single();

    const clientEmail = order
      ? (Array.isArray(order.clients) ? order.clients[0] : order.clients as { email: string } | null)?.email
      : null;

    if (clientEmail?.toLowerCase() !== user.email?.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ invoice });
}
