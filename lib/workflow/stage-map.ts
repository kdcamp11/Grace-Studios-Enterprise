export type SupplierPhase =
  | "awaiting_release"
  | "first_piece_production"
  | "first_piece_upload"
  | "bulk_production"
  | "supplier_qc"
  | "shipment_upload";

export type AdminWorkspace =
  | "creative"
  | "mockup"
  | "production_files"
  | "first_piece"
  | "bulk"
  | "fulfillment";

export interface WorkflowStageDef {
  adminLabel: string;
  clientLabel: string;
  supplierLabel: string | null;
  clientStatus: string;
  supplierStatus: string | null;
  isClientVisible: boolean;
  isSupplierVisible: boolean;
  adminWorkspace: AdminWorkspace;
  supplierPhase: SupplierPhase | null;
  allowedNext: string[];
}

export const WORKFLOW_STAGE_MAP: Record<string, WorkflowStageDef> = {
  onboarding: {
    adminLabel: "Onboarding",
    clientLabel: "Getting Started",
    supplierLabel: null,
    clientStatus: "Your order is being set up.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["creative_started", "design_confirmed"],
  },
  design_confirmed: {
    adminLabel: "Design Confirmed",
    clientLabel: "Design Confirmed",
    supplierLabel: null,
    clientStatus: "Your design brief has been confirmed.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["creative_started", "mockup_in_progress"],
  },
  creative_started: {
    adminLabel: "Creative Started",
    clientLabel: "Creative Started",
    supplierLabel: null,
    clientStatus: "Your design is being worked on.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["creative_submitted"],
  },
  creative_submitted: {
    adminLabel: "Creative Submitted",
    clientLabel: "Creative Submitted",
    supplierLabel: null,
    clientStatus: "Your design has been submitted for review.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["creative_in_review", "payment_pending"],
  },
  payment_pending: {
    adminLabel: "Payment Pending",
    clientLabel: "Awaiting Payment",
    supplierLabel: null,
    clientStatus: "Awaiting payment to continue.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["paid"],
  },
  paid: {
    adminLabel: "Paid",
    clientLabel: "Paid",
    supplierLabel: null,
    clientStatus: "Payment received.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["creative_in_review"],
  },
  creative_in_review: {
    adminLabel: "Creative In Review",
    clientLabel: "Creative In Review",
    supplierLabel: null,
    clientStatus: "Your design is under review.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["revision_requested", "creative_approved"],
  },
  revision_requested: {
    adminLabel: "Revision Requested",
    clientLabel: "Revision In Progress",
    supplierLabel: null,
    clientStatus: "A revision has been requested on your design.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["creative_in_review"],
  },
  creative_approved: {
    adminLabel: "Creative Approved",
    clientLabel: "Creative Approved",
    supplierLabel: null,
    clientStatus: "Your design has been approved.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["ready_for_production"],
  },
  ready_for_production: {
    adminLabel: "Ready for Production",
    clientLabel: "Ready for Production",
    supplierLabel: null,
    clientStatus: "Your design is ready for production.",
    supplierStatus: null,
    isClientVisible: false,
    isSupplierVisible: false,
    adminWorkspace: "creative",
    supplierPhase: null,
    allowedNext: ["mockup_in_progress"],
  },
  mockup_in_progress: {
    adminLabel: "Mockup In Progress",
    clientLabel: "Mockup In Progress",
    supplierLabel: null,
    clientStatus: "Grace Studios is creating your 2D mockup.",
    supplierStatus: null,
    isClientVisible: true,
    isSupplierVisible: false,
    adminWorkspace: "mockup",
    supplierPhase: null,
    allowedNext: ["mockup_review"],
  },
  mockup_review: {
    adminLabel: "Mockup Review",
    clientLabel: "Mockup Ready for Review",
    supplierLabel: null,
    clientStatus: "Your mockup is ready for your review.",
    supplierStatus: null,
    isClientVisible: true,
    isSupplierVisible: false,
    adminWorkspace: "mockup",
    supplierPhase: null,
    allowedNext: ["production_files_prep", "mockup_revision"],
  },
  mockup_revision: {
    adminLabel: "Mockup Revision",
    clientLabel: "Revision In Progress",
    supplierLabel: null,
    clientStatus: "Your revision is being worked on.",
    supplierStatus: null,
    isClientVisible: true,
    isSupplierVisible: false,
    adminWorkspace: "mockup",
    supplierPhase: null,
    allowedNext: ["mockup_review"],
  },
  production_files_prep: {
    adminLabel: "Production Files — Prep",
    clientLabel: "Production Package Being Prepared",
    supplierLabel: null,
    clientStatus: "Grace Studios is preparing production files.",
    supplierStatus: null,
    isClientVisible: true,
    isSupplierVisible: false,
    adminWorkspace: "production_files",
    supplierPhase: null,
    allowedNext: ["sent_to_supplier"],
  },
  sent_to_supplier: {
    adminLabel: "Sent to Supplier",
    clientLabel: "Sent to Production",
    supplierLabel: "New Order — Awaiting Release",
    clientStatus: "Your order has been sent to your production partner.",
    supplierStatus: "Review the order. Production begins when deposit is confirmed.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "production_files",
    supplierPhase: "awaiting_release",
    allowedNext: ["files_sent"],
  },
  files_sent: {
    adminLabel: "Files Sent — In Production",
    clientLabel: "In Production",
    supplierLabel: "Order Released — Ready to Start",
    clientStatus: "Your order is in production.",
    supplierStatus: "Production files shared. Start first piece when deposit is confirmed.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "first_piece",
    supplierPhase: "awaiting_release",
    allowedNext: ["first_piece_in_progress"],
  },
  first_piece_in_progress: {
    adminLabel: "First Piece In Production",
    clientLabel: "First Piece In Production",
    supplierLabel: "Produce First Piece",
    clientStatus: "Your supplier is creating the first physical sample.",
    supplierStatus: "Upload photos and video of the completed first piece when ready.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "first_piece",
    supplierPhase: "first_piece_production",
    allowedNext: ["first_piece_review"],
  },
  first_piece_review: {
    adminLabel: "First Piece Review",
    clientLabel: "First Piece Under Review",
    supplierLabel: "First Piece Submitted — Awaiting Review",
    clientStatus: "Grace Studios is reviewing your first piece sample.",
    supplierStatus: "First piece submitted. Awaiting Grace Studios and client review.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "first_piece",
    supplierPhase: "first_piece_upload",
    allowedNext: ["bulk_production", "first_piece_revision"],
  },
  first_piece_revision: {
    adminLabel: "First Piece Revision",
    clientLabel: "First Piece Revision In Progress",
    supplierLabel: "Revision Requested — Redo First Piece",
    clientStatus: "A revision has been requested on your first piece.",
    supplierStatus: "Review the revision notes and resubmit when complete.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "first_piece",
    supplierPhase: "first_piece_upload",
    allowedNext: ["first_piece_review"],
  },
  bulk_production: {
    adminLabel: "Bulk Production",
    clientLabel: "Bulk Production Underway",
    supplierLabel: "Bulk Production In Progress",
    clientStatus: "First piece approved. Your full order is being manufactured.",
    supplierStatus: "Produce the full bulk order. Mark complete when ready for QC.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "bulk",
    supplierPhase: "bulk_production",
    allowedNext: ["qc_verified"],
  },
  qc_verified: {
    adminLabel: "QC Verified",
    clientLabel: "Quality Check In Progress",
    supplierLabel: "QC Complete — Add Tracking",
    clientStatus: "Your order is undergoing final quality inspection.",
    supplierStatus: "Enter tracking information and mark as shipped.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "fulfillment",
    supplierPhase: "supplier_qc",
    allowedNext: ["shipped"],
  },
  shipped: {
    adminLabel: "Shipped",
    clientLabel: "Order Shipped",
    supplierLabel: "Shipped",
    clientStatus: "Your order is on its way.",
    supplierStatus: "Order shipped. Confirm delivered when received.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "fulfillment",
    supplierPhase: "shipment_upload",
    allowedNext: ["delivered"],
  },
  delivered: {
    adminLabel: "Delivered",
    clientLabel: "Order Delivered",
    supplierLabel: "Delivered",
    clientStatus: "Your order has been delivered.",
    supplierStatus: "Order delivered. Your work is complete.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "fulfillment",
    supplierPhase: "shipment_upload",
    allowedNext: ["complete"],
  },
  complete: {
    adminLabel: "Complete",
    clientLabel: "Order Complete",
    supplierLabel: "Complete",
    clientStatus: "Your order is complete.",
    supplierStatus: "Order complete.",
    isClientVisible: true,
    isSupplierVisible: true,
    adminWorkspace: "fulfillment",
    supplierPhase: "shipment_upload",
    allowedNext: [],
  },
};

const FALLBACK_DEF: WorkflowStageDef = {
  adminLabel: "Unknown",
  clientLabel: "In Progress",
  supplierLabel: null,
  clientStatus: "Your order is being processed.",
  supplierStatus: null,
  isClientVisible: false,
  isSupplierVisible: false,
  adminWorkspace: "creative",
  supplierPhase: null,
  allowedNext: [],
};

export function getStageDefinition(stage: string): WorkflowStageDef {
  return WORKFLOW_STAGE_MAP[stage] ?? FALLBACK_DEF;
}

export function isAllowedTransition(from: string, to: string): boolean {
  const def = WORKFLOW_STAGE_MAP[from];
  if (!def) return false;
  return def.allowedNext.includes(to);
}
