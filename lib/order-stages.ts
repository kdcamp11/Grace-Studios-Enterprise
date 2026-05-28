/**
 * lib/order-stages.ts — CANONICAL ORDER STAGE VOCABULARY (single source of truth)
 *
 * The orders.stage column is ADDITIVE: legacy stage strings (`onboarding`,
 * `design_confirmed`) continue to be written/read by older code paths, while
 * new code uses the canonical creative lifecycle vocabulary below.
 *
 * ALIAS STRATEGY: legacy stages map onto canonical creative stages via
 * STAGE_ALIAS. Always run a stage string through `normalizeStage()` (or the
 * helpers, which do it for you) before comparing or labelling so that both
 * legacy and new rows resolve consistently. This is what keeps existing screens
 * working while the new creative/production split rolls out.
 *
 * Decision recap: we do NOT rename legacy stages in the DB and do NOT bulk
 * rewrite existing rows. The DB CHECK constraint (migration 019) accepts both
 * the legacy and the new stage strings.
 */

export type CreativeStage =
  | 'creative_started'
  | 'creative_submitted'
  | 'payment_pending'
  | 'paid'
  | 'creative_in_review'
  | 'revision_requested'
  | 'creative_approved'
  | 'ready_for_production';

export type ProductionStage =
  | 'files_sent'
  | 'first_piece_in_progress'
  | 'first_piece_review'
  | 'bulk_production'
  | 'qc_verified'
  | 'shipped'
  | 'delivered'
  | 'complete';

export type LegacyStage = 'onboarding' | 'design_confirmed';

export type OrderStage = CreativeStage | ProductionStage | LegacyStage;

export type OrderType = 'creative' | 'production';

// ── Alias: legacy → canonical creative stage ────────────────────────────────
export const STAGE_ALIAS: Record<string, OrderStage> = {
  onboarding:       'creative_started',
  design_confirmed: 'creative_submitted',
};

/** Returns the canonical stage for a legacy alias, else the stage unchanged. */
export function normalizeStage(stage: string): OrderStage {
  return (STAGE_ALIAS[stage] ?? stage) as OrderStage;
}

// ── Human, customer-friendly labels (covers all legacy + new stages) ────────
export const STAGE_LABELS: Record<string, string> = {
  // legacy stages mapped to the same labels as their canonical creative stage
  onboarding:              'Design Started',
  design_confirmed:        'Design Submitted',
  // creative lifecycle
  creative_started:        'Design Started',
  creative_submitted:      'Design Submitted',
  payment_pending:         'Awaiting Activation',
  paid:                    'Activated',
  creative_in_review:      'In Creative Review',
  revision_requested:      'Revisions Requested',
  creative_approved:       'Creative Approved',
  ready_for_production:    'Ready for Production',
  // production lifecycle
  files_sent:              'In Production',
  first_piece_in_progress: 'First Piece In Progress',
  first_piece_review:      'First Piece Ready for Review',
  bulk_production:         'Bulk Production',
  qc_verified:             'QC Verified',
  shipped:                 'Shipped',
  delivered:               'Delivered',
  complete:                'Complete',
};

// ── Tailwind badge classes per stage ────────────────────────────────────────
export const STAGE_COLOR: Record<string, string> = {
  onboarding:              'text-brand-muted',
  design_confirmed:        'text-amber-500',
  creative_started:        'text-brand-muted',
  creative_submitted:      'text-amber-500',
  payment_pending:         'text-amber-400',
  paid:                    'text-emerald-400',
  creative_in_review:      'text-blue-400',
  revision_requested:      'text-amber-400 font-semibold',
  creative_approved:       'text-emerald-400 font-semibold',
  ready_for_production:    'text-blue-400 font-semibold',
  files_sent:              'text-blue-400',
  first_piece_in_progress: 'text-blue-400',
  first_piece_review:      'text-amber-400 font-semibold',
  bulk_production:         'text-blue-400',
  qc_verified:             'text-emerald-400',
  shipped:                 'text-emerald-400',
  delivered:               'text-emerald-400',
  complete:                'text-emerald-400',
};

const PRODUCTION_STAGES: ReadonlySet<string> = new Set<ProductionStage>([
  'files_sent',
  'first_piece_in_progress',
  'first_piece_review',
  'bulk_production',
  'qc_verified',
  'shipped',
  'delivered',
  'complete',
]);

/** Title-cases an unknown stage string as a last-resort label. */
function titleCase(stage: string): string {
  return stage
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Normalize then look up a human label; falls back to a title-cased value. */
export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? STAGE_LABELS[normalizeStage(stage)] ?? titleCase(stage);
}

/** 'production' if the normalized stage is a production stage, else 'creative'. */
export function stageType(stage: string): OrderType {
  return PRODUCTION_STAGES.has(normalizeStage(stage)) ? 'production' : 'creative';
}

/** True when the order is still awaiting concepts (covers legacy onboarding). */
export function isAwaitingConcepts(stage: string): boolean {
  return normalizeStage(stage) === 'creative_started';
}

/** True when the design has been submitted and is in review (legacy design_confirmed). */
export function isInDesignReview(stage: string): boolean {
  return normalizeStage(stage) === 'creative_submitted';
}

// ── Ordered stage lists for progress display ────────────────────────────────
export const CREATIVE_STAGE_ORDER: CreativeStage[] = [
  'creative_started',
  'creative_submitted',
  'payment_pending',
  'paid',
  'creative_in_review',
  'revision_requested',
  'creative_approved',
  'ready_for_production',
];

export const PRODUCTION_STAGE_ORDER: ProductionStage[] = [
  'files_sent',
  'first_piece_in_progress',
  'first_piece_review',
  'bulk_production',
  'qc_verified',
  'shipped',
  'delivered',
  'complete',
];
