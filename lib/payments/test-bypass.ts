import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Emails listed in TEST_BYPASS_EMAILS (comma-separated env var) skip
 * Stripe checkout and have payments marked as paid automatically.
 * Never set this in a production environment.
 */
const BYPASS_EMAILS: Set<string> = new Set(
  (process.env.TEST_BYPASS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isTestBypassEmail(email: string): boolean {
  return BYPASS_EMAILS.has(email.toLowerCase());
}

/**
 * Bypass for the order-keyed Creative Activation flow.
 * Marks the order as design_fee_paid and returns the success redirect URL.
 */
export async function bypassOrderDeposit(
  orderId: string,
  conceptSource: string | null,
  appUrl: string,
): Promise<string> {
  const admin = createAdminClient();

  await admin
    .from("orders")
    .update({ design_fee_paid: true })
    .eq("id", orderId);

  await admin.from("design_deposit_sessions").insert({
    order_id:     orderId,
    amount_cents: 0,
    status:       "paid",
    stripe_checkout_session_id: `bypass_${orderId}_${Date.now()}`,
  }).catch(() => {});

  const isClientProvided = conceptSource === "client_provided";
  return isClientProvided
    ? `${appUrl}/orders/${orderId}/tracker?deposit=success`
    : `${appUrl}/orders/${orderId}/concepts?unlocked=1`;
}

/**
 * Bypass for the design-keyed Creative Activation flow.
 * Replicates what the Stripe webhook does in handleDesignDepositFromDesign:
 * mints the order, stamps it on the brief, marks the design converted.
 * Returns the success redirect URL.
 */
export async function bypassDesignDeposit(
  designId: string,
  tenantId: string,
  appUrl: string,
): Promise<string | null> {
  const admin = createAdminClient();

  const { data: design } = await admin
    .from("designs")
    .select("tenant_id, client_id, kind")
    .eq("id", designId)
    .single();

  if (!design) return null;

  const effectiveTenantId = tenantId ?? design.tenant_id;

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      tenant_id:       effectiveTenantId,
      client_id:       design.client_id,
      stage:           "creative_in_review",
      design_fee_paid: true,
      concept_source:  design.kind === "upload" || design.kind === "builder"
                         ? "client_provided"
                         : null,
    })
    .select("id")
    .single();

  if (error || !order) return null;

  const orderId = order.id;

  await Promise.all([
    admin.from("briefs").update({ order_id: orderId }).eq("design_id", designId),
    admin.from("concepts").update({ order_id: orderId }).eq("design_id", designId),
    admin.from("designs").update({ status: "converted", order_id: orderId }).eq("id", designId),
  ]);

  await admin.from("stage_log").insert({
    order_id:   orderId,
    tenant_id:  effectiveTenantId,
    from_stage: "onboarding",
    to_stage:   "creative_in_review",
    changed_by: "system",
    note:       "Creative Activation bypassed — test user",
  }).catch(() => {});

  await admin.from("design_deposit_sessions").insert({
    tenant_id:                  effectiveTenantId,
    order_id:                   orderId,
    amount_cents:               0,
    status:                     "paid",
    stripe_checkout_session_id: `bypass_${designId}_${Date.now()}`,
  }).catch(() => {});

  return `${appUrl}/designs/${designId}/activated`;
}
