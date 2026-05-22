-- Migration 010: order activity feed + notifications + assigned_admin_id

-- ── 1. Add assigned_admin_id to orders ─────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── 2. Order activity log ───────────────────────────────────────────────────
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

CREATE POLICY "order_activity_admin_read"
  ON public.order_activity FOR SELECT
  USING (public.auth_role() IN ('admin', 'super_admin'));

CREATE POLICY "order_activity_service_insert"
  ON public.order_activity FOR INSERT
  WITH CHECK (public.auth_role() IN ('admin', 'super_admin'));

-- ── 3. Notifications ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  order_id   uuid        REFERENCES public.orders(id)           ON DELETE CASCADE,
  type       text        NOT NULL,
  title      text        NOT NULL,
  message    text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can see and update their own notifications
CREATE POLICY "notifications_own_select"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_own_update"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());
