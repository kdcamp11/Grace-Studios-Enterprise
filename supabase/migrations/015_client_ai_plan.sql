-- Migration 015: Add AI plan subscription fields to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id text          NULL,
  ADD COLUMN IF NOT EXISTS ai_plan            text          NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS ai_plan_status     text          NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ai_runs_included   integer       NOT NULL DEFAULT 3;
