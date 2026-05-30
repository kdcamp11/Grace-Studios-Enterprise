-- ============================================================
-- Migration 023: Client photo upload (separate from design file)
-- ============================================================
-- The upload-concept flow now collects TWO required files:
--   1. a production design file (.ai/.eps/.pdf/.svg) -> client_concept_url
--   2. a reference photo (.jpg/.png/.webp)           -> client_photo_url
-- ============================================================

alter table public.briefs
  add column if not exists client_photo_url text;
