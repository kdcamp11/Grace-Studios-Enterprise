-- ============================================================
-- Dev seed — run once in Supabase SQL editor for local development
-- ============================================================

insert into public.tenants (
  name,
  slug,
  custom_domain,
  logo_url,
  brand_primary,
  brand_secondary,
  brand_bg,
  brand_surface,
  brand_border,
  brand_text,
  brand_muted,
  enabled_sports,
  enabled_products,
  design_fee,
  commission_rate,
  active,
  plan,
  owner_email,
  support_email
) values (
  'Dev Studio',
  'dev',
  null,
  null,
  '#111111',
  '#333333',
  '#ffffff',
  '#f5f5f5',
  '#d4d4d4',
  '#0a0a0a',
  '#888888',
  array['basketball','football','soccer','baseball','softball','volleyball'],
  array['jersey','shorts','tracksuit','jacket'],
  0,
  0,
  true,
  'starter',
  'k.campjr@gmail.com',
  'k.campjr@gmail.com'
)
on conflict (slug) do nothing;
