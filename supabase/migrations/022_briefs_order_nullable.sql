-- ════════════════════════════════════════════════════════════════════════════
-- 022_briefs_order_nullable.sql
--
-- Design vs Order split — Phase 4b (makes order_id nullable on briefs and
-- concepts so design-keyed rows can exist before payment).
--
-- Deploy ONLY after the Phase 4 design-keyed save endpoints are live and
-- all new briefs/concepts carry design_id. Existing rows with order_id are
-- unaffected (NOT NULL → nullable is a safe, non-destructive change).
--
-- Idempotent: altering a nullable column that is already nullable is a no-op.
-- ════════════════════════════════════════════════════════════════════════════

-- ── briefs ──────────────────────────────────────────────────────────────────
-- Allow briefs to exist before an order is created (design-keyed pre-payment).
alter table public.briefs alter column order_id drop not null;

-- ── concepts ────────────────────────────────────────────────────────────────
-- Allow concepts to exist before an order is created (design-keyed pre-payment).
alter table public.concepts alter column order_id drop not null;
