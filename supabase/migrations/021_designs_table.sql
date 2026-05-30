-- ════════════════════════════════════════════════════════════════════════════
-- 021_designs_table.sql
--
-- Design vs Order split — Phase 1 (schema, ADDITIVE / non-destructive).
--
-- Introduces a `designs` table as the home for ALL pre-payment work. A design
-- holds the client's brief / builder canvas / uploaded file / AI concepts before
-- they commit. A real `orders` row is only minted when the $149 Creative
-- Activation is paid (see Phase 6 — the Stripe webhook converts a design into an
-- order).
--
-- This migration is purely additive:
--   • Creates the `designs` table + RLS + indexes.
--   • Adds a NULLABLE `design_id` FK to `briefs` and `concepts`.
--   • Leaves `briefs.order_id` / `concepts.order_id` as NOT NULL for now. They
--     are made nullable in a SEPARATE migration (022) only after the Phase 4
--     design-keyed save endpoints are shipping. Two-step rollout keeps rollback
--     clean with zero data loss.
--
-- Everything below is idempotent (if not exists / drop if exists).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. designs table ────────────────────────────────────────────────────────
create table if not exists public.designs (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  client_id   uuid        not null references public.clients(id) on delete cascade,
  kind        text        not null check (kind in ('ai', 'builder', 'upload')),
  status      text        not null default 'draft'
              check (status in ('draft', 'submitted', 'converted')),
  -- When converted at payment, the minted order is recorded here for traceability.
  order_id    uuid        references public.orders(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 2. RLS on designs ───────────────────────────────────────────────────────
alter table public.designs enable row level security;

-- Clients may read their own designs (matched by email OR user_id, mirroring the
-- orders_select_own policy from migration 013 so both auth paths work).
drop policy if exists "designs_select_own" on public.designs;
create policy "designs_select_own"
  on public.designs for select
  using (
    client_id in (
      select id from public.clients
      where (
        email   = auth.jwt() ->> 'email'
        or user_id = auth.uid()
      )
      and tenant_id = designs.tenant_id
    )
  );

-- Clients may insert their own designs.
drop policy if exists "designs_insert_own" on public.designs;
create policy "designs_insert_own"
  on public.designs for insert
  with check (
    client_id in (
      select id from public.clients
      where (
        email   = auth.jwt() ->> 'email'
        or user_id = auth.uid()
      )
      and tenant_id = designs.tenant_id
    )
  );

-- Clients may update their own designs (e.g. status draft → submitted).
drop policy if exists "designs_update_own" on public.designs;
create policy "designs_update_own"
  on public.designs for update
  using (
    client_id in (
      select id from public.clients
      where (
        email   = auth.jwt() ->> 'email'
        or user_id = auth.uid()
      )
      and tenant_id = designs.tenant_id
    )
  );

-- Admins / super admins have full access within their tenant.
drop policy if exists "designs_admin_all" on public.designs;
create policy "designs_admin_all"
  on public.designs for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

-- ── 3. briefs: add nullable design_id ───────────────────────────────────────
alter table public.briefs
  add column if not exists design_id uuid references public.designs(id) on delete set null;

-- ── 4. concepts: add nullable design_id ─────────────────────────────────────
alter table public.concepts
  add column if not exists design_id uuid references public.designs(id) on delete set null;

-- ── 5. indexes ──────────────────────────────────────────────────────────────
create index if not exists idx_designs_client   on public.designs(client_id);
create index if not exists idx_designs_tenant    on public.designs(tenant_id);
create index if not exists idx_designs_status     on public.designs(status);
create index if not exists idx_briefs_design     on public.briefs(design_id);
create index if not exists idx_concepts_design   on public.concepts(design_id);
