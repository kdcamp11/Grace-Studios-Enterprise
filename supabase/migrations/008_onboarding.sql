-- ============================================================
-- Migration 008: Tenant Onboarding State
-- ============================================================

-- Track whether a tenant has completed the setup wizard
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;

-- Existing tenants are considered already onboarded
UPDATE public.tenants SET onboarding_complete = true WHERE created_at < now();
