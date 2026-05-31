-- ============================================================
-- Migration 027: Preferred Supplier + Production Pricing
-- ============================================================
-- Adds preferred_supplier_id to tenants for auto-routing,
-- and production pricing fields to orders for per-set cost
-- calculations (standard $25/set, premium $50/set, 50% deposit).

-- ── Tenant: preferred supplier ────────────────────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS preferred_supplier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Orders: production pricing ────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS production_pricing_tier TEXT
    CHECK (production_pricing_tier IN ('standard', 'premium'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quantity INTEGER
    CHECK (quantity IS NULL OR quantity > 0);

-- Stored in cents to avoid floating-point issues
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS production_total_cents    INTEGER CHECK (production_total_cents    IS NULL OR production_total_cents    >= 0);
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS production_deposit_cents  INTEGER CHECK (production_deposit_cents  IS NULL OR production_deposit_cents  >= 0);
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS production_balance_cents  INTEGER CHECK (production_balance_cents  IS NULL OR production_balance_cents  >= 0);

-- Sparse index for preferred supplier lookups
CREATE INDEX IF NOT EXISTS idx_tenants_preferred_supplier
  ON public.tenants(preferred_supplier_id)
  WHERE preferred_supplier_id IS NOT NULL;

-- Sparse index for orders with pricing
CREATE INDEX IF NOT EXISTS idx_orders_production_tier
  ON public.orders(production_pricing_tier)
  WHERE production_pricing_tier IS NOT NULL;
