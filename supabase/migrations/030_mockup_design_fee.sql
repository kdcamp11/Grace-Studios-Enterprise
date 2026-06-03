-- Migration 030: Mockup Design Fee
-- Tracks whether the client has paid the design fee at mockup approval,
-- and when the assigned designer was paid their 90% share.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mockup_fee_paid BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS designer_payout_paid_at TIMESTAMPTZ;
