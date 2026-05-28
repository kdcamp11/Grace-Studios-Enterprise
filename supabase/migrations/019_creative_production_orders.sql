-- ════════════════════════════════════════════════════════════════════════════
-- 019_creative_production_orders.sql
--
-- Creative / Production order-type refactor.
--
-- THREE ARCHITECTURE DECISIONS implemented here (ADDITIVE, non-destructive):
--   1. Production modeling = a new `order_type` column on the EXISTING `orders`
--      table + a self-referencing `originating_creative_order_id`. There is NO
--      separate production_orders table — production data already lives on orders.
--   2. Stage vocabulary = ADDITIVE + ALIAS. We KEEP every existing stage string
--      working and simply ADD the new creative stages to the CHECK constraint.
--      We do NOT rename onboarding/design_confirmed and we do NOT bulk-rewrite
--      existing rows' stage values. lib/order-stages.ts is the single source of
--      truth that aliases legacy stages onto the new canonical vocabulary.
--   3. Design preview is rendered client-side from briefs.zone_colors — there are
--      no schema changes here for previews (no canvas capture, no new storage).
--
-- Everything below is idempotent (if not exists / drop if exists).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. order_type + self-reference ──────────────────────────────────────────
alter table public.orders
  add column if not exists order_type text not null default 'creative'
    check (order_type in ('creative', 'production'));

alter table public.orders
  add column if not exists originating_creative_order_id uuid
    references public.orders(id) on delete set null;

-- ── 2. Extend the stage CHECK additively ────────────────────────────────────
-- Keep ALL 10 existing stages, ADD the 8 new creative stages.
alter table public.orders drop constraint if exists orders_stage_check;
alter table public.orders add constraint orders_stage_check check (stage in (
  -- existing (legacy) stages — preserved unchanged
  'onboarding',
  'design_confirmed',
  'files_sent',
  'first_piece_in_progress',
  'first_piece_review',
  'bulk_production',
  'qc_verified',
  'shipped',
  'delivered',
  'complete',
  -- new creative lifecycle stages
  'creative_started',
  'creative_submitted',
  'payment_pending',
  'paid',
  'creative_in_review',
  'revision_requested',
  'creative_approved',
  'ready_for_production'
));

-- ── 3. Defensive backfill of order_type ─────────────────────────────────────
-- Classify rows that are clearly in fulfillment as production. Pre-fulfillment
-- rows (onboarding / design_confirmed / any creative stage) stay 'creative'.
update public.orders
  set order_type = 'production'
  where stage in (
    'files_sent',
    'first_piece_in_progress',
    'first_piece_review',
    'bulk_production',
    'qc_verified',
    'shipped',
    'delivered',
    'complete'
  )
  and order_type = 'creative';

-- ── 4. RLS — tighten supplier + add designer-creative visibility ────────────
-- Suppliers may only see PRODUCTION orders assigned to them. They must NEVER
-- see creative drafts.
drop policy if exists "orders_supplier_own" on public.orders;
create policy "orders_supplier_own"
  on public.orders for select
  using (
    supplier_user_id = auth.uid()
    and order_type = 'production'
  );

-- Designers may see all creative orders in their tenant (so they can pick up
-- the creative queue). The existing orders_designer_assigned policy from
-- migration 009 is intentionally left intact alongside this one.
drop policy if exists "orders_designer_creative" on public.orders;
create policy "orders_designer_creative"
  on public.orders for select
  using (
    public.auth_role() = 'designer'
    and tenant_id = public.auth_tenant_id()
    and order_type = 'creative'
  );

-- ── 5. Index ────────────────────────────────────────────────────────────────
create index if not exists orders_order_type_idx on public.orders(order_type);
