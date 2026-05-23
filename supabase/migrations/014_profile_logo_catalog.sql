-- Migration 014: Add logo_url + production catalog fields to profiles
-- These are used by the supplier settings page (logo upload + sports/products they produce)
-- and by the client settings page (team logo).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS logo_url         TEXT          NULL,
  ADD COLUMN IF NOT EXISTS enabled_sports   TEXT[]        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enabled_products TEXT[]        NOT NULL DEFAULT '{}';
