/**
 * lib/order-milestones.ts — DEPENDENCY-DRIVEN PRODUCTION TIMELINE
 *
 * The client-facing order timeline is derived from REAL workflow conditions
 * (concrete deliverables and verified state in the database), NOT from a single
 * `orders.stage` enum that can be jumped ahead.
 *
 * Each of the 9 production steps has a completion predicate computed from actual
 * data: uploaded mockups, mockup approval, production files, payments, supplier
 * first-piece media, client approval, and tracking. Steps are gated MONOTONICALLY
 * — a step can only be `done`/`current` if every prior dependency is satisfied —
 * so the timeline can never show a later stage complete while an earlier
 * requirement is still missing.
 *
 * This guarantees, e.g., that "First Piece In Production" never activates before
 * the mockup is approved, production files exist, and the first payment is in.
 */
import { normalizeStage, stageType, type OrderStage } from "@/lib/order-stages";

// Canonical production-stage order, used ONLY as a monotonic floor for the
// back-half supplier stages (bulk/qc/shipped/delivered) that are advanced by
// real supplier actions and have no separate client-visible artifact.
const PROD_FLOOR: OrderStage[] = [
  "mockup_in_progress",
  "mockup_review",
  "mockup_revision",
  "production_files_prep",
  "sent_to_supplier",
  "files_sent",
  "first_piece_in_progress",
  "first_piece_revision",
  "first_piece_review",
  "bulk_production",
  "qc_verified",
  "shipped",
  "delivered",
  "complete",
];

const floorRank = (stage: string): number =>
  PROD_FLOOR.indexOf(normalizeStage(stage) as OrderStage);

// ── Inputs: real data the timeline is derived from ──────────────────────────
export interface MilestoneInput {
  stage:               string;
  production_choice?:  string | null;
  deposit_paid?:       boolean | null;   // first production payment
  balance_paid?:       boolean | null;   // final production payment
  tracking_number?:    string | null;
  production_file_url?: string | null;
  mockups:             { id: string }[];
  media:               { client_approved: boolean | null }[];
  files:               { label: string | null }[];
}

export type StepStatus = "done" | "current" | "upcoming";

export interface TimelineStep {
  key:    string;
  label:  string;
  status: StepStatus;
}

// The 9 production-only steps a client sees after proceeding to production.
export const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: "mockup_in_progress",        label: "Mockup In Progress" },
  { key: "mockup_review",             label: "Mockup Review" },
  { key: "production_files",          label: "Production Files" },
  { key: "first_piece_in_production", label: "First Piece In Production" },
  { key: "first_piece_review",        label: "First Piece Review" },
  { key: "bulk_production",           label: "Bulk Production" },
  { key: "quality_check",             label: "Quality Check" },
  { key: "shipped",                   label: "Shipped" },
  { key: "delivered",                 label: "Delivered" },
];

export interface Milestones {
  mockupUploaded:          boolean;
  mockupApproved:          boolean;
  productionFilesUploaded: boolean;
  firstPaymentPaid:        boolean;
  firstPieceUploaded:      boolean;
  firstPieceApproved:      boolean;
  bulkComplete:            boolean;
  qcComplete:              boolean;
  finalPaymentPaid:        boolean;
  trackingUploaded:        boolean;
  delivered:               boolean;
}

export interface DerivedTimeline {
  steps:        TimelineStep[];
  /** -1 = order has not entered production yet; 0..8 = active step; 9 = fully delivered. */
  currentIndex: number;
  inProduction: boolean;
  milestones:   Milestones;
}

/**
 * The primitive signals every lifecycle view boils down to. The status page
 * derives these from full record arrays; the workflow board and portal derive
 * them from per-order counts. Both then call `resolveTimeline` so EVERY view
 * computes the exact same lifecycle phase from the exact same logic.
 */
export interface MilestoneSignals {
  stage:               string;
  production_choice?:  string | null;
  deposit_paid?:       boolean | null;
  balance_paid?:       boolean | null;
  tracking_number?:    string | null;
  mockupUploaded:          boolean;
  productionFilesUploaded: boolean;
  firstPieceUploaded:      boolean;
  firstPieceApproved:      boolean;
}

/**
 * SINGLE SOURCE OF TRUTH for the production lifecycle phase.
 *
 * Given the primitive milestone signals, returns the monotonic timeline — a
 * step is only `done`/`current` when every prior dependency is satisfied, so a
 * later phase can never display while an earlier requirement is still missing.
 */
export function resolveTimeline(s: MilestoneSignals): DerivedTimeline {
  const inProduction =
    s.production_choice === "production" || stageType(s.stage) === "production";

  const rank = floorRank(s.stage);
  const atOrPast = (st: OrderStage) => rank >= 0 && rank >= PROD_FLOOR.indexOf(st);

  // Mockup approval is recorded by the client's approve action, which advances
  // the stage past the mockup phase. Reaching production_files_prep+ requires a
  // real client approval (or explicit admin override) — choose-production no
  // longer skips into it. Gated by mockupUploaded so a jumped stage with no
  // mockup artifact can never read as approved.
  const mockupApproved = s.mockupUploaded && atOrPast("production_files_prep");
  const firstPaymentPaid = s.deposit_paid === true;
  const bulkComplete     = atOrPast("qc_verified");   // bulk finished → moved to QC
  const qcComplete       = atOrPast("shipped");        // QC passed → moved to shipping
  const finalPaymentPaid = s.balance_paid === true;
  const trackingUploaded = !!s.tracking_number;
  const delivered        = atOrPast("delivered");

  const milestones: Milestones = {
    mockupUploaded:          s.mockupUploaded,
    mockupApproved,
    productionFilesUploaded: s.productionFilesUploaded,
    firstPaymentPaid,
    firstPieceUploaded:      s.firstPieceUploaded,
    firstPieceApproved:      s.firstPieceApproved,
    bulkComplete, qcComplete, finalPaymentPaid, trackingUploaded, delivered,
  };

  // Per-step completion predicates (index aligns with TIMELINE_STEPS).
  const complete: boolean[] = [
    s.mockupUploaded,                                   // 1 Mockup In Progress
    mockupApproved,                                     // 2 Mockup Review
    s.productionFilesUploaded && firstPaymentPaid,      // 3 Production Files
    s.firstPieceUploaded,                               // 4 First Piece In Production
    s.firstPieceApproved,                               // 5 First Piece Review
    bulkComplete,                                       // 6 Bulk Production
    qcComplete && finalPaymentPaid,                     // 7 Quality Check (final 50% gates shipment)
    delivered,                                          // 8 Shipped (done when delivered)
    delivered,                                          // 9 Delivered
  ];

  let doneThrough = -1;
  for (let i = 0; i < complete.length; i++) {
    if (complete[i]) doneThrough = i;
    else break;
  }

  const currentIndex = inProduction ? doneThrough + 1 : -1;

  const steps: TimelineStep[] = TIMELINE_STEPS.map((step, i) => {
    let status: StepStatus;
    if (currentIndex === -1)        status = "upcoming";
    else if (i <= doneThrough)      status = "done";
    else if (i === doneThrough + 1) status = "current";
    else                            status = "upcoming";
    return { key: step.key, label: step.label, status };
  });

  return { steps, currentIndex, inProduction, milestones };
}

/**
 * Maps a derived `currentIndex` to its column key + label. Clamps the
 * fully-delivered sentinel (9) onto the Delivered column.
 */
export function stepForIndex(currentIndex: number): { key: string; label: string } | null {
  if (currentIndex < 0) return null;
  const i = Math.min(currentIndex, TIMELINE_STEPS.length - 1);
  return TIMELINE_STEPS[i];
}

/**
 * Derives the production timeline purely from real database conditions, from
 * full record arrays (status page). Computes the primitive signals and
 * delegates to `resolveTimeline` so it shares one lifecycle calculation.
 */
export function deriveTimeline(o: MilestoneInput): DerivedTimeline {
  return resolveTimeline({
    stage:             o.stage,
    production_choice: o.production_choice,
    deposit_paid:      o.deposit_paid,
    balance_paid:      o.balance_paid,
    tracking_number:   o.tracking_number,
    mockupUploaded:          o.mockups.length > 0,
    productionFilesUploaded:
      !!o.production_file_url ||
      o.files.some((f) => (f.label ?? "").toLowerCase().includes("production")),
    firstPieceUploaded:      o.media.length > 0,
    firstPieceApproved:      o.media.some((m) => m.client_approved === true),
  });
}
