-- Add logo_url to clients so each organization can brand their portal experience
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.clients.logo_url IS
  'Public URL of the organization''s logo, stored in the assets/logos/clients/ Supabase Storage bucket.';
