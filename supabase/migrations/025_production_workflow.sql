-- ════════════════════════════════════════════════════════════════════════════
-- 025_production_workflow.sql
--
-- Adds the full post-activation production workflow stages:
--   mockup_in_progress → mockup_review → (mockup_revision →) mockup_review
--   → production_files_prep → sent_to_supplier
--   → first_piece_in_progress → first_piece_review → (first_piece_revision →)
--   → bulk_production → qc_verified → shipped → delivered → complete
--
-- Also adds:
--   - mockup_revision_used / first_piece_revision_used flags on orders
--   - order_mockups table for 2D mockup image uploads
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Expand stage CHECK constraint ────────────────────────────────────────
alter table public.orders drop constraint if exists orders_stage_check;
alter table public.orders add constraint orders_stage_check check (stage in (
  'onboarding','design_confirmed',
  'creative_started','creative_submitted','payment_pending','paid',
  'creative_in_review','revision_requested','creative_approved','ready_for_production',
  'mockup_in_progress','mockup_review','mockup_revision',
  'production_files_prep','sent_to_supplier',
  'files_sent','first_piece_in_progress','first_piece_review','first_piece_revision',
  'bulk_production','qc_verified','shipped','delivered','complete'
));

-- ── 2. Track revision usage (one revision allowed per step) ─────────────────
alter table public.orders
  add column if not exists mockup_revision_used boolean not null default false;

alter table public.orders
  add column if not exists first_piece_revision_used boolean not null default false;

-- ── 3. order_mockups table ───────────────────────────────────────────────────
create table if not exists public.order_mockups (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  created_at     timestamptz not null default now(),
  order_id       uuid        not null references public.orders(id) on delete cascade,
  uploaded_by    uuid        references auth.users(id),
  image_url      text        not null,
  label          text,
  revision_round int         not null default 1
);

alter table public.order_mockups enable row level security;

-- Admins can do everything
drop policy if exists "admin_all_order_mockups" on public.order_mockups;
create policy "admin_all_order_mockups" on public.order_mockups
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin','super_admin')
    )
  );

-- Clients can see mockups for their own orders
drop policy if exists "client_select_own_mockups" on public.order_mockups;
create policy "client_select_own_mockups" on public.order_mockups
  for select using (
    exists (
      select 1 from public.orders o
      join public.clients c on c.id = o.client_id
      where o.id = order_id
        and lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
create index if not exists idx_order_mockups_order  on public.order_mockups(order_id);
create index if not exists idx_order_mockups_tenant on public.order_mockups(tenant_id);
