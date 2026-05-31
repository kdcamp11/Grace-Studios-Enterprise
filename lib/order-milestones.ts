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
 * Derives the production timeline purely from real database conditions.
 * Monotonic: a step is `done` only when it and ALL prior steps are complete.
 */
export function deriveTimeline(o: MilestoneInput): DerivedTimeline {
  // An order is "in production" once the client has proceeded to production or
  // the stage itself is a production stage.
  const inProduction =
    o.production_choice === "production" || stageType(o.stage) === "production";

  const rank = floorRank(o.stage);
  const atOrPast = (s: OrderStage) => rank >= 0 && rank >= PROD_FLOOR.indexOf(s);

  // ── Milestone signals from concrete data ──────────────────────────────────
  const mockupUploaded = o.mockups.length > 0;
  // Mockup approval is recorded by the client's approve action, which advances
  // the stage past the mockup phase. Reaching production_files_prep+ requires a
  // real client approval (or explicit admin override) — choose-production no
  // longer skips into it.
  const mockupApproved = mockupUploaded && atOrPast("production_files_prep");
  const productionFilesUploaded =
    !!o.production_file_url ||
    o.files.some((f) => (f.label ?? "").toLowerCase().includes("production"));
  const firstPaymentPaid   = o.deposit_paid === true;
  const firstPieceUploaded = o.media.length > 0;
  const firstPieceApproved = o.media.some((m) => m.client_approved === true);
  const bulkComplete       = atOrPast("qc_verified");   // bulk finished → moved to QC
  const qcComplete         = atOrPast("shipped");        // QC passed → moved to shipping
  const finalPaymentPaid   = o.balance_paid === true;
  const trackingUploaded   = !!o.tracking_number;
  const delivered          = atOrPast("delivered");

  const milestones: Milestones = {
    mockupUploaded, mockupApproved, productionFilesUploaded, firstPaymentPaid,
    firstPieceUploaded, firstPieceApproved, bulkComplete, qcComplete,
    finalPaymentPaid, trackingUploaded, delivered,
  };

  // ── Per-step completion predicates (index aligns with TIMELINE_STEPS) ──────
  const complete: boolean[] = [
    mockupUploaded,                                  // 1 Mockup In Progress
    mockupApproved,                                  // 2 Mockup Review
    productionFilesUploaded && firstPaymentPaid,     // 3 Production Files
    firstPieceUploaded,                              // 4 First Piece In Production
    firstPieceApproved,                              // 5 First Piece Review
    bulkComplete,                                    // 6 Bulk Production
    qcComplete && finalPaymentPaid,                  // 7 Quality Check (final 50% gates shipment)
    delivered,                                       // 8 Shipped (done when delivered)
    delivered,                                       // 9 Delivered
  ];

  // Monotonic resolution: count leading contiguous completed steps.
  let doneThrough = -1;
  for (let i = 0; i < complete.length; i++) {
    if (complete[i]) doneThrough = i;
    else break;
  }

  const currentIndex = inProduction ? doneThrough + 1 : -1;

  const steps: TimelineStep[] = TIMELINE_STEPS.map((s, i) => {
    let status: StepStatus;
    if (currentIndex === -1)            status = "upcoming";
    else if (i <= doneThrough)          status = "done";
    else if (i === doneThrough + 1)     status = "current";
    else                                status = "upcoming";
    return { key: s.key, label: s.label, status };
  });

  return { steps, currentIndex, inProduction, milestones };
}
