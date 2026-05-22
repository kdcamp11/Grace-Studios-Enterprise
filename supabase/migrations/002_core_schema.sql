-- ============================================================
-- White-Label SaaS Platform — Core Schema
-- Migration 002: profiles, clients, orders, briefs, concepts,
--                stage_log, revisions, reference_images
-- All tables are scoped to a tenant_id.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Teardown — ensures clean slate on re-runs
-- ────────────────────────────────────────────────────────────
drop function if exists public.auth_role() cascade;
drop function if exists public.auth_tenant_id() cascade;
drop table if exists public.first_piece_media  cascade;
drop table if exists public.revisions          cascade;
drop table if exists public.stage_log          cascade;
drop table if exists public.reference_images   cascade;
drop table if exists public.concepts           cascade;
drop table if exists public.briefs             cascade;
drop table if exists public.orders             cascade;
drop table if exists public.clients            cascade;
drop table if exists public.profiles           cascade;

-- ────────────────────────────────────────────────────────────
-- 1. profiles  (must exist before auth helper functions)
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  email       text        not null,
  full_name   text,
  role        text        not null default 'client'
              check (role in ('client', 'supplier', 'admin', 'super_admin')),
  company     text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create index if not exists idx_profiles_tenant on public.profiles(tenant_id);

-- ────────────────────────────────────────────────────────────
-- Auth helpers (defined after profiles so column refs are valid)
-- security definer bypasses RLS — prevents recursive policy evaluation
-- ────────────────────────────────────────────────────────────
create or replace function public.auth_role()
returns text
language plpgsql stable security definer
as $$
begin
  return (select role from public.profiles where id = auth.uid() limit 1);
end;
$$;

create or replace function public.auth_tenant_id()
returns uuid
language plpgsql stable security definer
as $$
begin
  return (select tenant_id from public.profiles where id = auth.uid() limit 1);
end;
$$;

-- Users can read/write their own row
create policy "profiles_own"
  on public.profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can read all profiles within their tenant
create policy "profiles_admin_read"
  on public.profiles for select
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );


-- ────────────────────────────────────────────────────────────
-- 2. clients
-- ────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  created_at      timestamptz not null default now(),
  name            text        not null,
  contact_name    text,
  email           text        not null,
  sport           text,
  city            text,
  retainer_plan   text        check (retainer_plan in ('starter','pro','elite','none')),
  retainer_status text        check (retainer_status in ('active','paused','cancelled','none')),
  unique (tenant_id, email)
);

alter table public.clients enable row level security;

create policy "clients_select_own"
  on public.clients for select
  using (email = auth.jwt() ->> 'email');

create policy "clients_insert_own"
  on public.clients for insert
  with check (true);

create policy "clients_update_own"
  on public.clients for update
  using (email = auth.jwt() ->> 'email');

create policy "clients_admin_all"
  on public.clients for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_clients_tenant on public.clients(tenant_id);


-- ────────────────────────────────────────────────────────────
-- 3. orders
-- ────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  created_at          timestamptz not null default now(),
  order_number        text,
  client_id           uuid        not null references public.clients(id) on delete cascade,
  stage               text        not null default 'onboarding'
                      check (stage in (
                        'onboarding','design_confirmed','files_sent',
                        'first_piece_in_progress','first_piece_review',
                        'bulk_production','qc_verified','shipped',
                        'delivered','complete'
                      )),
  package_tier        text        check (package_tier in ('tier1','tier2','tier3','tier4')),
  deposit_paid        boolean     not null default false,
  balance_paid        boolean     not null default false,
  design_fee_paid     boolean     not null default false,
  supplier            text,
  supplier_region     text        check (supplier_region in ('domestic','international')),
  supplier_user_id    uuid        references auth.users(id),
  estimated_delivery  date,
  tracking_number     text,
  shipping_cost       numeric,
  account_lead        text,
  approved_at         timestamptz,
  production_choice   text,
  notes               text
);

alter table public.orders enable row level security;

create policy "orders_select_own"
  on public.orders for select
  using (
    client_id = (
      select id from public.clients
      where email = auth.jwt() ->> 'email'
        and tenant_id = orders.tenant_id
      limit 1
    )
  );

create policy "orders_insert_own"
  on public.orders for insert
  with check (
    client_id = (
      select id from public.clients
      where email = auth.jwt() ->> 'email'
        and tenant_id = orders.tenant_id
      limit 1
    )
  );

create policy "orders_update_own"
  on public.orders for update
  using (
    client_id = (
      select id from public.clients
      where email = auth.jwt() ->> 'email'
        and tenant_id = orders.tenant_id
      limit 1
    )
  );

create policy "orders_admin_all"
  on public.orders for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create policy "orders_supplier_own"
  on public.orders for select
  using (supplier_user_id = auth.uid());

create index if not exists idx_orders_tenant    on public.orders(tenant_id);
create index if not exists idx_orders_client    on public.orders(client_id);
create index if not exists idx_orders_stage     on public.orders(stage);


-- ────────────────────────────────────────────────────────────
-- 4. briefs
-- ────────────────────────────────────────────────────────────
create table if not exists public.briefs (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants(id) on delete cascade,
  created_at            timestamptz not null default now(),
  order_id              uuid        not null references public.orders(id) on delete cascade,
  primary_colors        text,
  secondary_colors      text,
  accent_color          text,
  colors_to_avoid       text,
  hex_confirmed         boolean     not null default false,
  brand_match           boolean     not null default false,
  design_system         text        check (design_system in ('bold','gradient','program','culture')),
  negative_references   text,
  jersey_cut            text,
  sublimated            boolean,
  home_colorway         text,
  away_colorway         text,
  number_style          text,
  player_names          boolean     not null default false,
  gs_logo_placement     text        check (gs_logo_placement in ('chest','back_neck','sleeve')),
  logos_to_include      text,
  sponsor_text          text,
  logo_url              text,
  logo_urls             text[],
  reference_image_url   text,
  reference_image_urls  text[],
  vision_prompt         text,
  ai_prompt             text,
  player_roster         jsonb
);

alter table public.briefs enable row level security;

create policy "briefs_select_own"
  on public.briefs for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = briefs.tenant_id
    )
  );

create policy "briefs_insert_own"
  on public.briefs for insert
  with check (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = briefs.tenant_id
    )
  );

create policy "briefs_admin_all"
  on public.briefs for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_briefs_tenant   on public.briefs(tenant_id);
create index if not exists idx_briefs_order    on public.briefs(order_id);


-- ────────────────────────────────────────────────────────────
-- 5. concepts
-- ────────────────────────────────────────────────────────────
create table if not exists public.concepts (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  created_at       timestamptz not null default now(),
  order_id         uuid        not null references public.orders(id) on delete cascade,
  concept_number   integer     not null check (concept_number between 1 and 4),
  image_url        text        not null,
  selected         boolean     not null default false,
  client_feedback  text
);

alter table public.concepts enable row level security;

create policy "concepts_select_own"
  on public.concepts for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = concepts.tenant_id
    )
  );

create policy "concepts_insert_own"
  on public.concepts for insert
  with check (true);

create policy "concepts_update_own"
  on public.concepts for update
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = concepts.tenant_id
    )
  );

create policy "concepts_admin_all"
  on public.concepts for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_concepts_tenant on public.concepts(tenant_id);
create index if not exists idx_concepts_order  on public.concepts(order_id);


-- ────────────────────────────────────────────────────────────
-- 6. stage_log
-- ────────────────────────────────────────────────────────────
create table if not exists public.stage_log (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    uuid        not null references public.tenants(id) on delete cascade,
  created_at   timestamptz not null default now(),
  order_id     uuid        not null references public.orders(id) on delete cascade,
  from_stage   text        not null,
  to_stage     text        not null,
  changed_at   timestamptz not null default now(),
  changed_by   text        not null check (changed_by in ('client','system','admin')),
  note         text,
  email_sent   boolean     not null default false
);

alter table public.stage_log enable row level security;

create policy "stage_log_select_own"
  on public.stage_log for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = stage_log.tenant_id
    )
  );

create policy "stage_log_insert"
  on public.stage_log for insert
  with check (true);

create policy "stage_log_admin_all"
  on public.stage_log for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_stage_log_tenant on public.stage_log(tenant_id);
create index if not exists idx_stage_log_order  on public.stage_log(order_id);


-- ────────────────────────────────────────────────────────────
-- 7. revisions
-- ────────────────────────────────────────────────────────────
create table if not exists public.revisions (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  created_at      timestamptz not null default now(),
  order_id        uuid        not null references public.orders(id) on delete cascade,
  round_number    integer     not null default 1,
  submitted_by    text,
  revision_notes  text,
  status          text        not null default 'pending'
                  check (status in ('pending','applied','rejected')),
  extra_charge    boolean     not null default false,
  charge_amount   numeric
);

alter table public.revisions enable row level security;

create policy "revisions_select_own"
  on public.revisions for select
  using (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = revisions.tenant_id
    )
  );

create policy "revisions_insert_own"
  on public.revisions for insert
  with check (
    order_id in (
      select o.id from public.orders o
      join public.clients c on c.id = o.client_id
      where c.email = auth.jwt() ->> 'email'
        and o.tenant_id = revisions.tenant_id
    )
  );

create policy "revisions_admin_all"
  on public.revisions for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_revisions_tenant on public.revisions(tenant_id);
create index if not exists idx_revisions_order  on public.revisions(order_id);


-- ────────────────────────────────────────────────────────────
-- 8. reference_images  (per-tenant library)
-- ────────────────────────────────────────────────────────────
create table if not exists public.reference_images (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id) on delete cascade,
  created_at    timestamptz not null default now(),
  item_type     text        not null,
  design_system text        not null check (design_system in ('bold','gradient','program','culture')),
  image_url     text        not null,
  tags          text,
  active        boolean     not null default true
);

alter table public.reference_images enable row level security;

create policy "reference_images_public_read"
  on public.reference_images for select
  using (active = true);

create policy "reference_images_admin_all"
  on public.reference_images for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create index if not exists idx_ref_images_tenant on public.reference_images(tenant_id);
create index if not exists idx_ref_images_system on public.reference_images(design_system, active);


-- ────────────────────────────────────────────────────────────
-- 9. first_piece_media
-- ────────────────────────────────────────────────────────────
create table if not exists public.first_piece_media (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null references public.tenants(id) on delete cascade,
  created_at          timestamptz not null default now(),
  order_id            uuid        not null references public.orders(id) on delete cascade,
  uploaded_by         uuid        references auth.users(id),
  media_url           text        not null,
  media_type          text        not null check (media_type in ('photo','video')),
  caption             text,
  admin_approved      boolean,
  admin_note          text,
  admin_reviewed_at   timestamptz,
  admin_reviewed_by   uuid        references auth.users(id),
  client_visible      boolean     not null default false,
  client_approved     boolean,
  client_note         text,
  client_reviewed_at  timestamptz
);

alter table public.first_piece_media enable row level security;

create policy "media_supplier_own"
  on public.first_piece_media for all
  using  (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);

create policy "media_admin_all"
  on public.first_piece_media for all
  using (
    public.auth_role() in ('admin', 'super_admin')
    and tenant_id = public.auth_tenant_id()
  );

create policy "media_clients_approved"
  on public.first_piece_media for select
  using (client_visible = true);

create index if not exists idx_fpm_tenant on public.first_piece_media(tenant_id);
create index if not exists idx_fpm_order  on public.first_piece_media(order_id);
