-- Migration 018: Update supplier markup default from 3% to 10%
--
-- Changes the column default for new tenants and updates any existing
-- tenant rows that still have the old 3.0 default value.

alter table tenants
  alter column supplier_markup_percent set default 10.0;

-- Update existing tenants still on the old 3% default.
-- Tenants who have manually set a different value are left untouched.
update tenants
  set supplier_markup_percent = 10.0
  where supplier_markup_percent = 3.0;
