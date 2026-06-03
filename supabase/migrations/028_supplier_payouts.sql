-- ============================================================
-- Migration 028: Supplier Payout Tracking
-- ============================================================
-- Tracks when Grace Studios pays the supplier their portion of
-- each production installment (deposit and balance).
-- The payout amount = client installment / 1.10 (removes 10% markup).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS supplier_deposit_paid_at TIMESTAMPTZ;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS supplier_balance_paid_at TIMESTAMPTZ;
