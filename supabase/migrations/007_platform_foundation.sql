-- ============================================================
-- Migration 007: Platform Foundation
-- Phase 1 of multi-tenant Level 4 SaaS architecture
-- ============================================================

-- ─── 1. Rename gs_logo_placement → logo_placement in briefs ──
ALTER TABLE public.briefs RENAME COLUMN gs_logo_placement TO logo_placement;

-- ─── 2. Expand profiles role enum ─────────────────────────────
-- Drop existing check constraint and replace with expanded set
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client','supplier','admin','super_admin','designer','sales_rep'));

-- ─── 3. Expand stage_log changed_by ──────────────────────────
ALTER TABLE public.stage_log DROP CONSTRAINT IF EXISTS stage_log_changed_by_check;
ALTER TABLE public.stage_log
  ADD CONSTRAINT stage_log_changed_by_check
  CHECK (changed_by IN ('client','system','admin','designer','supplier'));

-- ─── 4. Add Stripe Connect readiness to tenants ───────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_account_id        text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id       text,
  ADD COLUMN IF NOT EXISTS platform_fee_percent     numeric NOT NULL DEFAULT 0
    CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100);

-- ─── 5. Subscriptions table ───────────────────────────────────
-- Tracks SaaS subscription per tenant (platform monetization)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan                    text        NOT NULL DEFAULT 'starter'
                          CHECK (plan IN ('starter','pro','enterprise')),
  status                  text        NOT NULL DEFAULT 'trialing'
                          CHECK (status IN ('active','trialing','past_due','canceled','paused')),
  stripe_subscription_id  text,
  stripe_customer_id      text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  trial_end               timestamptz,
  mrr                     numeric     NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_super_admin"
  ON public.subscriptions FOR ALL
  USING (public.auth_role() = 'super_admin');

CREATE POLICY "subscriptions_admin_read"
  ON public.subscriptions FOR SELECT
  USING (
    public.auth_role() IN ('admin','super_admin')
    AND tenant_id = public.auth_tenant_id()
  );

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON public.subscriptions(tenant_id);

-- ─── 6. Platform fee log ──────────────────────────────────────
-- Records each fee taken at payment time (architecture-ready,
-- populated when Stripe Connect is wired up)
CREATE TABLE IF NOT EXISTS public.platform_fees (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id      uuid        REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id        uuid        REFERENCES public.orders(id) ON DELETE SET NULL,
  gross_amount    numeric     NOT NULL,
  fee_percent     numeric     NOT NULL,
  fee_amount      numeric     NOT NULL,
  net_amount      numeric     NOT NULL,
  stripe_transfer_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_fees_super_admin"
  ON public.platform_fees FOR ALL
  USING (public.auth_role() = 'super_admin');

CREATE INDEX IF NOT EXISTS idx_platform_fees_tenant  ON public.platform_fees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_payment ON public.platform_fees(payment_id);

-- ─── 7. updated_at trigger for subscriptions ──────────────────
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
