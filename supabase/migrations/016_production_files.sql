-- Migration 016: Add zone_colors to briefs + production_file_url to orders

-- Zone colors saved from the jersey builder (7 zones as hex values)
ALTER TABLE public.briefs
  ADD COLUMN IF NOT EXISTS zone_colors jsonb NULL;

COMMENT ON COLUMN public.briefs.zone_colors IS
  'Hex color values for each jersey zone set in the Jersey Builder. '
  'Keys: jerseyTop, collar, jerseyShorts, jerseySidePanels, jerseyLowerPanels, sleevePanels, shortSidePanels';

-- URL to the auto-generated production SVG file (written on client approval)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS production_file_url text NULL;

COMMENT ON COLUMN public.orders.production_file_url IS
  'Supabase Storage public URL of the auto-generated production SVG file. '
  'Generated automatically when the client approves their design.';
