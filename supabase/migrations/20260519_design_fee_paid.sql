-- Add design_fee_paid flag to orders.
-- When false (default): client sees a teaser on the concept board and must
-- pay the design deposit before viewing all 4 renders or approving.
-- When true: full concept board is unlocked for review and approval.

alter table public.orders
  add column if not exists design_fee_paid boolean not null default false;
