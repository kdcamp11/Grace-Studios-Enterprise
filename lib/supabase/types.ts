export type TenantPlan = 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';

export interface Subscription {
  id: string;
  tenant_id: string;
  plan: TenantPlan;
  status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  mrr: number;
  created_at: string;
  updated_at: string;
}
export type UserRole = 'client' | 'supplier' | 'admin' | 'super_admin' | 'designer' | 'sales_rep';
// Canonical vocabulary lives in lib/order-stages.ts — keep this union in sync.
export type OrderStage =
  // legacy stages (still written/read by older code paths)
  | 'onboarding'
  | 'design_confirmed'
  // production stages
  | 'files_sent'
  | 'first_piece_in_progress'
  | 'first_piece_review'
  | 'bulk_production'
  | 'qc_verified'
  | 'shipped'
  | 'delivered'
  | 'complete'
  // new creative lifecycle stages
  | 'creative_started'
  | 'creative_submitted'
  | 'payment_pending'
  | 'paid'
  | 'creative_in_review'
  | 'revision_requested'
  | 'creative_approved'
  | 'ready_for_production';

export interface Tenant {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  logo_url: string | null;
  brand_primary: string;
  brand_secondary: string;
  brand_bg: string;
  brand_surface: string;
  brand_border: string;
  brand_text: string;
  brand_muted: string;
  enabled_sports: string[];
  enabled_products: string[];
  design_fee: number;
  commission_rate: number;
  active: boolean;
  plan: TenantPlan;
  owner_email: string;
  support_email: string | null;
  support_url: string | null;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  platform_fee_percent: number;
  onboarding_complete: boolean;
}

export interface TenantStats {
  tenant_id: string;
  total_orders: number;
  active_orders: number;
  total_clients: number;
  total_users: number;
  total_revenue: number;
}

export interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  company: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  created_at: string;
  name: string;
  contact_name: string | null;
  email: string;
  sport: string | null;
  city: string | null;
  retainer_plan: 'starter' | 'pro' | 'elite' | 'none' | null;
  retainer_status: 'active' | 'paused' | 'cancelled' | 'none' | null;
}

export interface Order {
  id: string;
  tenant_id: string;
  created_at: string;
  order_number: string | null;
  client_id: string;
  stage: OrderStage;
  order_type?: 'creative' | 'production';
  originating_creative_order_id?: string | null;
  package_tier: 'tier1' | 'tier2' | 'tier3' | 'tier4' | null;
  deposit_paid: boolean;
  balance_paid: boolean;
  design_fee_paid: boolean;
  supplier: string | null;
  supplier_region: 'domestic' | 'international' | null;
  supplier_user_id: string | null;
  estimated_delivery: string | null;
  tracking_number: string | null;
  shipping_cost: number | null;
  account_lead: string | null;
  approved_at: string | null;
  production_choice: string | null;
  notes: string | null;
}

export interface Brief {
  id: string;
  tenant_id: string;
  created_at: string;
  order_id: string;
  primary_colors: string | null;
  secondary_colors: string | null;
  accent_color: string | null;
  colors_to_avoid: string | null;
  hex_confirmed: boolean;
  brand_match: boolean;
  design_system: 'bold' | 'gradient' | 'program' | 'culture' | null;
  negative_references: string | null;
  jersey_cut: string | null;
  sublimated: boolean | null;
  home_colorway: string | null;
  away_colorway: string | null;
  number_style: string | null;
  player_names: boolean;
  logo_placement: 'chest' | 'back_neck' | 'sleeve' | null;
  logos_to_include: string | null;
  sponsor_text: string | null;
  reference_image_url: string | null;
  vision_prompt: string | null;
  ai_prompt: string | null;
  player_roster: unknown;
}

export interface Concept {
  id: string;
  tenant_id: string;
  created_at: string;
  order_id: string;
  concept_number: number;
  image_url: string;
  selected: boolean;
  client_feedback: string | null;
}
