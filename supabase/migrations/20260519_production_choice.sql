-- Tracks client's choice after design approval: design files only vs full production.
-- production_deposit_paid gates stage advancement to first_piece_in_progress.

alter table public.orders
  add column if not exists production_choice text
    check (production_choice in ('design_file', 'production')),
  add column if not exists production_deposit_paid boolean not null default false;
