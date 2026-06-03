/**
 * Automatic designer payout via Stripe Connect.
 * Grace Studios keeps 10%; the designer receives 90% of the mockup design fee.
 * Idempotent — skips if the payout timestamp is already recorded.
 */
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createDesignerTransfer(
  orderId: string,
  grossCents: number,
  paymentIntentId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  // Idempotency: skip if payout already stamped
  const { data: order } = await admin
    .from("orders")
    .select("assigned_designer_id, designer_payout_paid_at")
    .eq("id", orderId)
    .single();

  if (!order?.assigned_designer_id) {
    console.warn(`[designer-transfer] order ${orderId} has no assigned_designer_id — skipping designer payout`);
    return;
  }

  if ((order as Record<string, unknown>).designer_payout_paid_at) {
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id, stripe_account_onboarded")
    .eq("id", order.assigned_designer_id)
    .single();

  const accountId = (profile as { stripe_account_id?: string | null; stripe_account_onboarded?: boolean } | null)?.stripe_account_id;
  const onboarded = (profile as { stripe_account_id?: string | null; stripe_account_onboarded?: boolean } | null)?.stripe_account_onboarded;

  if (!accountId || !onboarded) {
    console.warn(`[designer-transfer] designer ${order.assigned_designer_id} has no connected Stripe account — skipping payout`);
    return;
  }

  let chargesEnabled = false;
  try {
    const account = await stripe.accounts.retrieve(accountId);
    chargesEnabled = account.charges_enabled;
  } catch {
    return;
  }
  if (!chargesEnabled) return;

  const designerCents = Math.round(grossCents * 0.90);
  if (designerCents <= 0) return;

  const transfer = await stripe.transfers.create({
    amount:             designerCents,
    currency:           "usd",
    destination:        accountId,
    transfer_group:     orderId,
    source_transaction: paymentIntentId,
    metadata: {
      order_id: orderId,
      type:     "designer_design_fee",
    },
  });

  const now = new Date().toISOString();
  await admin.from("orders").update({ designer_payout_paid_at: now }).eq("id", orderId);

  console.log(`[designer-transfer] transfer ${transfer.id}: $${(designerCents / 100).toFixed(2)} to ${accountId} for order ${orderId} (design fee)`);
}
