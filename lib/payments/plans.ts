import type { TenantPlan } from "@/lib/supabase/types";

export interface PlanConfig {
  id:            TenantPlan;
  label:         string;
  tagline:       string;
  priceMonthly:  number;       // in cents; 0 = free or contact-sales
  contactSales:  boolean;      // true = enterprise, show "Contact Sales" not a price
  stripePriceId: string | null;
  features:      string[];
  limits: {
    orders:  number | null;    // null = unlimited
    users:   number | null;
    clients: number | null;
  };
}

export const PLANS: Record<TenantPlan, PlanConfig> = {
  starter: {
    id:            "starter",
    label:         "Starter",
    tagline:       "Operational infrastructure for growing apparel programs.",
    priceMonthly:  9900,        // $99/mo
    contactSales:  false,
    stripePriceId: process.env.STRIPE_PRICE_STARTER ?? null,
    features: [
      "Full platform workflow — order, track, deliver",
      "Client portal and brief management",
      "Concept development and design approvals",
      "Production coordination and fulfillment oversight",
      "Up to 5 team members",
      "Standard support",
    ],
    limits: { orders: 25, users: 5, clients: 100 },
  },
  pro: {
    id:            "pro",
    label:         "Pro",
    tagline:       "The primary operating tier for serious apparel organizations.",
    priceMonthly:  24900,       // $249/mo
    contactSales:  false,
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
    features: [
      "Everything in Starter",
      "Unlimited orders and client accounts",
      "Expanded supplier coordination and fulfillment management",
      "Advanced organization and roster management",
      "Priority concept development queue",
      "Up to 15 team members",
      "Priority support",
      "Stripe Connect payouts",
    ],
    limits: { orders: null, users: 15, clients: null },
  },
  enterprise: {
    id:            "enterprise",
    label:         "Enterprise",
    tagline:       "Custom operational solutions for large-scale programs and multi-org operations.",
    priceMonthly:  0,
    contactSales:  true,
    stripePriceId: null,
    features: [
      "Everything in Pro",
      "Dedicated account management",
      "Multi-program and white-label capabilities",
      "Custom operational integrations",
      "High-volume fulfillment support",
      "Custom SLA and service agreements",
      "Unlimited team members",
    ],
    limits: { orders: null, users: null, clients: null },
  },
};

export function planForPriceId(priceId: string): TenantPlan | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceId === priceId) return plan.id;
  }
  return null;
}
