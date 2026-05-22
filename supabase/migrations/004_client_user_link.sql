-- Migration 004: link clients to auth users
-- Adds user_id to clients so returning users skip the team-info form.

alter table public.clients
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_clients_user_id on public.clients(user_id);

-- Allow a logged-in user to read their own client rows
create policy "clients_select_by_user_id"
  on public.clients for select
  using (user_id = auth.uid());

-- Allow a logged-in user to update their own client row (profile edits)
create policy "clients_update_by_user_id"
  on public.clients for update
  using (user_id = auth.uid());
