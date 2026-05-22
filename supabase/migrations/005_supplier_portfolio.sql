-- Migration 005: supplier portfolio items

create table if not exists public.supplier_portfolio (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  image_url    text        not null,
  caption      text,
  sport        text,
  created_at   timestamptz not null default now()
);

alter table public.supplier_portfolio enable row level security;

-- Suppliers manage their own portfolio
create policy "portfolio_select_own"
  on public.supplier_portfolio for select
  using (user_id = auth.uid());

create policy "portfolio_insert_own"
  on public.supplier_portfolio for insert
  with check (user_id = auth.uid());

create policy "portfolio_delete_own"
  on public.supplier_portfolio for delete
  using (user_id = auth.uid());

-- Admins can read all portfolio items within their tenant
create policy "portfolio_admin_select"
  on public.supplier_portfolio for select
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_portfolio_user   on public.supplier_portfolio(user_id);
create index if not exists idx_portfolio_tenant on public.supplier_portfolio(tenant_id);
