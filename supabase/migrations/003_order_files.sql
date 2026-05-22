-- ============================================================
-- White-Label SaaS Platform
-- Migration 003: order_files table
-- ============================================================

create table if not exists public.order_files (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  created_at     timestamptz not null default now(),
  order_id       uuid        not null references public.orders(id) on delete cascade,
  uploaded_by    uuid        references auth.users(id),
  file_url       text        not null,
  file_name      text        not null,
  file_size      bigint,
  file_type      text,
  label          text,
  client_visible boolean     not null default false
);

alter table public.order_files enable row level security;

create policy "order_files_client_visible"
  on public.order_files for select
  using (
    client_visible = true
    and order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = order_files.tenant_id
    )
  );

create policy "order_files_admin_all"
  on public.order_files for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create policy "order_files_supplier_own"
  on public.order_files for all
  using  (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);

create index if not exists idx_order_files_tenant on public.order_files(tenant_id);
create index if not exists idx_order_files_order  on public.order_files(order_id);
