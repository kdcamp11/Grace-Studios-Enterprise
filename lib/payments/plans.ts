import type { TenantPlan } from "@/lib/supabase/types";

export interface PlanConfig {
  id: TenantPlan;
  label: string;
  priceMonthly: number; // in cents
  stripePriceId: string | null; // null = free/manual
  features: string[];
  limits: {
    orders: number | null; // null = unlimited
    users: number | null;
    clients: number | null;
  };
}

export const PLANS: Record<TenantPlan, PlanConfig> = {
  starter: {
    id: "starter",
    label: "Starter",
    priceMonthly: 0,
    stripePriceId: null,
    features: [
      "Up to 10 active orders",
      "Up to 3 team members",
      "AI concept generation",
      "Client portal",
      "Basic email notifications",
    ],
    limits: { orders: 10, users: 3, clients: 50 },
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceMonthly: 29900, // $299/mo
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? null,
    features: [
      "Unlimited orders",
      "Up to 10 team members",
      "AI concept generation",
      "Client portal + custom domain",
      "Priority email support",
      "Stripe Connect payouts",
    ],
    limits: { orders: null, users: 10, clients: null },
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    priceMonthly: 99900, // $999/mo
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE ?? null,
    features: [
      "Unlimited everything",
      "Dedicated account manager",
      "Custom AI training",
      "White-label mobile app",
      "SLA guarantee",
      "Custom integrations",
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
