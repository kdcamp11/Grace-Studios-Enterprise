-- Allow designs to be marked as declined so they drop off the portal list
-- without being hard-deleted (preserves the brief/concept data for auditing).

do $$
begin
  -- Drop the existing unnamed check constraint on designs.status.
  -- PostgreSQL auto-names it <table>_<column>_check, but we also try the
  -- explicit name from the original migration just in case.
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'designs' and column_name = 'status'
      and constraint_name like '%status%'
  ) then
    execute (
      select 'alter table public.designs drop constraint ' || constraint_name
      from information_schema.table_constraints
      where table_name = 'designs'
        and constraint_type = 'CHECK'
        and constraint_name like '%status%'
      limit 1
    );
  end if;
end $$;

alter table public.designs
  add constraint designs_status_check
  check (status in ('draft', 'submitted', 'converted', 'declined'));
