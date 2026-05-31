-- ════════════════════════════════════════════════════════════════════════════
-- 026_on_hold.sql
--
-- Adds on_hold flag to orders, allowing any order to be temporarily paused
-- without changing its lifecycle stage. Grace Enterprise can place orders
-- on hold for missing assets, payment delays, supplier delays, etc.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists on_hold boolean not null default false;

-- Sparse index — fast lookup of all paused orders
create index if not exists idx_orders_on_hold on public.orders(on_hold)
  where on_hold = true;
