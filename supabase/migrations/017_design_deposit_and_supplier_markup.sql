-- ============================================================
-- Migration 017: Design Deposit, Client Concepts & Supplier Markup
-- ============================================================

-- ─── orders: track concept source ────────────────────────────
alter table public.orders
  add column if not exists concept_source text
    not null default 'ai'
    check (concept_source in ('ai', 'client_provided'));

-- ─── briefs: store client-uploaded concept ────────────────────
alter table public.briefs
  add column if not exists client_concept_url   text,
  add column if not exists client_concept_notes text;

-- ─── tenants: supplier markup percentage ─────────────────────
-- Supplier base prices entered by admin are marked up by this
-- percentage before being shown as client-facing prices.
alter table public.tenants
  add column if not exists supplier_markup_percent numeric not null default 3.0
    check (supplier_markup_percent >= 0 and supplier_markup_percent <= 100);

-- ─── design_deposit_sessions ─────────────────────────────────
-- Lightweight tracking table for design deposit Stripe sessions.
-- Decoupled from invoices (which are for production orders).
create table if not exists public.design_deposit_sessions (
  id                          uuid        primary key default gen_random_uuid(),
  tenant_id                   uuid        not null references public.tenants(id) on delete cascade,
  order_id                    uuid        not null references public.orders(id) on delete cascade,
  amount_cents                integer     not null default 15000,   -- $150.00
  status                      text        not null default 'pending'
                              check (status in ('pending', 'paid', 'failed', 'canceled')),
  stripe_checkout_session_id  text        unique,
  stripe_payment_intent_id    text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.design_deposit_sessions enable row level security;

-- Clients can read sessions for their own orders
create policy "dds_client_select"
  on public.design_deposit_sessions for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = design_deposit_sessions.tenant_id
    )
  );

create policy "dds_admin_all"
  on public.design_deposit_sessions for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_dds_tenant    on public.design_deposit_sessions(tenant_id);
create index if not exists idx_dds_order     on public.design_deposit_sessions(order_id);
create index if not exists idx_dds_session   on public.design_deposit_sessions(stripe_checkout_session_id);

create trigger dds_updated_at
  before update on public.design_deposit_sessions
  for each row execute function public.set_updated_at();
