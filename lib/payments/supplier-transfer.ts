/**
 * Automatic supplier payout via Stripe Connect.
 * Grace Studios keeps 10%; the supplier receives 90% of each client payment.
 * Idempotent — skips if the payout timestamp is already recorded.
 */
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const SUPPLIER_MARGIN_PERCENT = 10;

export async function createSupplierTransfer(
  orderId: string,
  grossDollars: number,
  paymentIntentId: string | null,
  isDeposit: boolean,
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  const { data: order } = await admin
    .from("orders")
    .select("supplier_user_id, supplier_deposit_paid_at, supplier_balance_paid_at")
    .eq("id", orderId)
    .single();

  if (!order?.supplier_user_id) return;

  // Idempotency: skip if payout already stamped (webhook + sync-payment can both fire)
  const alreadyPaid = isDeposit
    ? !!(order as Record<string, unknown>).supplier_deposit_paid_at
    : !!(order as Record<string, unknown>).supplier_balance_paid_at;
  if (alreadyPaid) return;

  const { data: supplier } = await admin
    .from("profiles")
    .select("stripe_account_id, stripe_account_onboarded")
    .eq("id", order.supplier_user_id)
    .single();

  const accountId = (supplier as { stripe_account_id?: string | null; stripe_account_onboarded?: boolean } | null)?.stripe_account_id;
  const onboarded = (supplier as { stripe_account_id?: string | null; stripe_account_onboarded?: boolean } | null)?.stripe_account_onboarded;
  if (!accountId || !onboarded) return;

  let chargesEnabled = false;
  try {
    const account = await stripe.accounts.retrieve(accountId);
    chargesEnabled = account.charges_enabled;
  } catch {
    return;
  }
  if (!chargesEnabled) return;

  const grossCents    = Math.round(grossDollars * 100);
  const supplierCents = Math.round(grossCents * (1 - SUPPLIER_MARGIN_PERCENT / 100));
  if (supplierCents <= 0) return;

  const transfer = await stripe.transfers.create({
    amount:      supplierCents,
    currency:    "usd",
    destination: accountId,
    ...(paymentIntentId ? { source_transaction: paymentIntentId } : {}),
    metadata: { order_id: orderId, type: isDeposit ? "supplier_deposit" : "supplier_balance" },
  });

  const col = isDeposit ? "supplier_deposit_paid_at" : "supplier_balance_paid_at";
  const now = new Date().toISOString();
  await admin.from("orders").update({ [col]: now }).eq("id", orderId);

  console.log(`[supplier-transfer] transfer ${transfer.id}: $${(supplierCents / 100).toFixed(2)} to ${accountId} for order ${orderId} (${isDeposit ? "deposit" : "balance"})`);
}
