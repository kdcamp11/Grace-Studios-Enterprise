-- ============================================================
-- Migration 006: invoices + payments
-- Hybrid payment system: Stripe card + ACH/wire manual flow
-- ============================================================

-- ─── invoices ─────────────────────────────────────────────
create table if not exists public.invoices (
  id                          uuid        primary key default gen_random_uuid(),
  tenant_id                   uuid        not null references public.tenants(id) on delete cascade,
  order_id                    uuid        not null references public.orders(id) on delete cascade,
  invoice_number              text        not null,
  total_amount                numeric     not null check (total_amount >= 0),
  deposit_amount              numeric     not null default 0 check (deposit_amount >= 0),
  balance_due                 numeric     generated always as (total_amount - deposit_amount) stored,
  currency                    text        not null default 'usd',
  status                      text        not null default 'draft'
                              check (status in (
                                'draft','sent','pending_payment','pending_verification',
                                'partially_paid','paid','failed','canceled'
                              )),
  recommended_payment_method  text        not null default 'stripe'
                              check (recommended_payment_method in ('stripe','ach_wire','hybrid')),
  payment_threshold_band      text        not null default 'small'
                              check (payment_threshold_band in ('small','hybrid','large','enterprise')),
  card_enabled                boolean     not null default true,
  bank_name                   text,
  bank_routing                text,
  bank_account                text,
  bank_swift                  text,
  bank_beneficiary            text,
  admin_notes                 text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

alter table public.invoices enable row level security;

-- Clients can read invoices for their own orders
create policy "invoices_client_select"
  on public.invoices for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = invoices.tenant_id
    )
  );

create policy "invoices_admin_all"
  on public.invoices for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_invoices_tenant   on public.invoices(tenant_id);
create index if not exists idx_invoices_order    on public.invoices(order_id);
create index if not exists idx_invoices_status   on public.invoices(status);


-- ─── payments ─────────────────────────────────────────────
create table if not exists public.payments (
  id                          uuid        primary key default gen_random_uuid(),
  tenant_id                   uuid        not null references public.tenants(id) on delete cascade,
  invoice_id                  uuid        not null references public.invoices(id) on delete cascade,
  order_id                    uuid        not null references public.orders(id) on delete cascade,
  method                      text        not null check (method in ('stripe','ach','wire')),
  amount                      numeric     not null check (amount > 0),
  status                      text        not null default 'pending'
                              check (status in (
                                'pending','pending_verification','paid','failed','canceled'
                              )),
  stripe_payment_intent_id    text,
  stripe_checkout_session_id  text,
  confirmation_file_url       text,
  verified_by                 uuid        references auth.users(id),
  verified_at                 timestamptz,
  admin_note                  text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.payments enable row level security;

-- Clients can read payments for their orders and insert new ones
create policy "payments_client_select"
  on public.payments for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = payments.tenant_id
    )
  );

create policy "payments_client_insert"
  on public.payments for insert
  with check (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = payments.tenant_id
    )
  );

create policy "payments_admin_all"
  on public.payments for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_payments_tenant   on public.payments(tenant_id);
create index if not exists idx_payments_invoice  on public.payments(invoice_id);
create index if not exists idx_payments_order    on public.payments(order_id);
create index if not exists idx_payments_session  on public.payments(stripe_checkout_session_id);


-- ─── auto-updated_at trigger ──────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();
