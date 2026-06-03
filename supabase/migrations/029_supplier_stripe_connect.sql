-- ============================================================
-- Migration 029: Supplier Stripe Connect
-- ============================================================
-- Allows supplier profiles to receive automatic Stripe payouts
-- by linking their Stripe Express account to their profile.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_account_onboarded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_account
  ON public.profiles(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;
