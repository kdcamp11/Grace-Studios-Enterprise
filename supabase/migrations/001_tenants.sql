-- ============================================================
-- White-Label SaaS Platform — Tenant Foundation
-- Migration 001: tenants table
-- ============================================================

create table if not exists public.tenants (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  -- Identity
  name             text        not null,                     -- "Rival Athletics"
  slug             text        not null unique,              -- "rival" → rival.platform.com
  custom_domain    text        unique,                       -- "app.rivalathletics.com"

  -- Branding
  logo_url         text,
  brand_primary    text        not null default '#111111',   -- CSS hex, main accent
  brand_secondary  text        not null default '#333333',   -- CSS hex, secondary accent
  brand_bg         text        not null default '#ffffff',   -- CSS hex, page background
  brand_surface    text        not null default '#f5f5f5',   -- CSS hex, card/surface
  brand_border     text        not null default '#d4d4d4',   -- CSS hex, borders
  brand_text       text        not null default '#0a0a0a',   -- CSS hex, body text
  brand_muted      text        not null default '#888888',   -- CSS hex, muted/subtext

  -- Product catalog (which sports/product types this tenant offers)
  enabled_sports   text[]      not null default array['basketball','football','soccer','baseball','softball','volleyball'],
  enabled_products text[]      not null default array['jersey','shorts','tracksuit','jacket'],

  -- Pricing
  design_fee       numeric     not null default 0,           -- flat design fee charged to client
  commission_rate  numeric     not null default 0,           -- platform commission % (0–1)

  -- Status
  active           boolean     not null default true,
  plan             text        not null default 'starter'
                               check (plan in ('starter', 'pro', 'enterprise')),

  -- Contact (tenant owner)
  owner_email      text        not null,
  support_email    text,
  support_url      text
);

alter table public.tenants enable row level security;

-- Only super-admins (service role) manage tenants — no anon or user access
create policy "tenants_service_only"
  on public.tenants
  using (false);

create index if not exists idx_tenants_slug          on public.tenants(slug);
create index if not exists idx_tenants_custom_domain on public.tenants(custom_domain);
create index if not exists idx_tenants_active        on public.tenants(active);
