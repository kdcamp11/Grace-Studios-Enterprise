-- ============================================================
-- Migration 012: Catch-up for migrations 007–011
-- Safe to run even if some of these were previously applied.
-- Paste this entire file into the Supabase SQL editor and run.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- FROM 007: Platform Foundation
-- ─────────────────────────────────────────────────────────────

-- Rename gs_logo_placement → logo_placement in briefs
-- (the old name causes a 500 on every concepts page load)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'briefs'
      AND column_name  = 'gs_logo_placement'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'briefs'
      AND column_name  = 'logo_placement'
  ) THEN
    ALTER TABLE public.briefs RENAME COLUMN gs_logo_placement TO logo_placement;
  END IF;
END;
$$;

-- Expand profiles role enum
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('client','supplier','admin','super_admin','designer','sales_rep'));

-- Expand stage_log changed_by
ALTER TABLE public.stage_log DROP CONSTRAINT IF EXISTS stage_log_changed_by_check;
ALTER TABLE public.stage_log
  ADD CONSTRAINT stage_log_changed_by_check
  CHECK (changed_by IN ('client','system','admin','designer','supplier'));

-- Stripe Connect columns on tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_account_id       text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS platform_fee_percent    numeric NOT NULL DEFAULT 0
    CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100);

-- Subscriptions table
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

DROP POLICY IF EXISTS "subscriptions_super_admin"   ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_read"    ON public.subscriptions;

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

-- Platform fees table
CREATE TABLE IF NOT EXISTS public.platform_fees (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id         uuid        REFERENCES public.payments(id)          ON DELETE SET NULL,
  order_id           uuid        REFERENCES public.orders(id)             ON DELETE SET NULL,
  gross_amount       numeric     NOT NULL,
  fee_percent        numeric     NOT NULL,
  fee_amount         numeric     NOT NULL,
  net_amount         numeric     NOT NULL,
  stripe_transfer_id text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_fees_super_admin" ON public.platform_fees;

CREATE POLICY "platform_fees_super_admin"
  ON public.platform_fees FOR ALL
  USING (public.auth_role() = 'super_admin');

CREATE INDEX IF NOT EXISTS idx_platform_fees_tenant  ON public.platform_fees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_payment ON public.platform_fees(payment_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER subscriptions_updated_at
      BEFORE UPDATE ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- FROM 008: Tenant Onboarding State
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

UPDATE public.tenants SET onboarding_complete = true WHERE created_at < now();


-- ─────────────────────────────────────────────────────────────
-- FROM 009: Designer Assignment
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_designer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_designer ON public.orders(assigned_designer_id);

DROP POLICY IF EXISTS "orders_designer_assigned" ON public.orders;

CREATE POLICY "orders_designer_assigned"
  ON public.orders FOR SELECT
  USING (assigned_designer_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- FROM 010: Activity Feed + Notifications + assigned_admin_id
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Order activity log
CREATE TABLE IF NOT EXISTS public.order_activity (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  order_id      uuid        NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  actor_user_id uuid        REFERENCES auth.users(id)               ON DELETE SET NULL,
  actor_role    text,
  event_type    text        NOT NULL,
  event_message text        NOT NULL,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_activity_order  ON public.order_activity(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activity_tenant ON public.order_activity(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_activity_time   ON public.order_activity(order_id, created_at DESC);

ALTER TABLE public.order_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_activity_admin_read"      ON public.order_activity;
DROP POLICY IF EXISTS "order_activity_service_insert"  ON public.order_activity;

CREATE POLICY "order_activity_admin_read"
  ON public.order_activity FOR SELECT
  USING (public.auth_role() IN ('admin', 'super_admin'));

CREATE POLICY "order_activity_service_insert"
  ON public.order_activity FOR INSERT
  WITH CHECK (public.auth_role() IN ('admin', 'super_admin'));

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  order_id   uuid        REFERENCES public.orders(id)           ON DELETE CASCADE,
  type       text        NOT NULL,
  title      text        NOT NULL,
  message    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add read column idempotently (table may already exist without it)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_insert" ON public.notifications;

CREATE POLICY "notifications_own"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "notifications_admin_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (public.auth_role() IN ('admin', 'super_admin'));


-- ─────────────────────────────────────────────────────────────
-- FROM 011: Client Logo
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
