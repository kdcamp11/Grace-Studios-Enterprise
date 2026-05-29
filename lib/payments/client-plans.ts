export type ClientAiPlan = "starter" | "growth" | "studio";

export interface ClientPlanConfig {
  id:              ClientAiPlan;
  label:           string;
  priceMonthly:    number;        // in cents; 0 = free
  stripePriceId:   string | null; // null = free tier, no checkout
  runsIncluded:    number | null; // null = unlimited
  priorityAccess:  boolean;
  tagline:         string;
  features:        string[];
}

export const CLIENT_PLANS: Record<ClientAiPlan, ClientPlanConfig> = {
  starter: {
    id:             "starter",
    label:          "Starter",
    priceMonthly:   0,
    stripePriceId:  null,
    runsIncluded:   3,
    priorityAccess: false,
    tagline:        "Included with every Grace Studios account.",
    features: [
      "Concept development for up to 3 active projects per cycle",
      "Full concept set per project",
      "Standard development queue",
      "Full order tracking & approvals",
    ],
  },
  growth: {
    id:             "growth",
    label:          "Growth",
    priceMonthly:   2500,  // $25/mo
    stripePriceId:  process.env.STRIPE_PRICE_CLIENT_GROWTH ?? null,
    runsIncluded:   10,
    priorityAccess: true,
    tagline:        "For programs running multiple orders at once.",
    features: [
      "Concept development for up to 10 active projects per cycle",
      "Full concept set per project",
      "Priority development queue",
      "Full order tracking & approvals",
    ],
  },
  studio: {
    id:             "studio",
    label:          "Studio",
    priceMonthly:   4500,  // $45/mo
    stripePriceId:  process.env.STRIPE_PRICE_CLIENT_STUDIO ?? null,
    runsIncluded:   null,
    priorityAccess: true,
    tagline:        "Full concept development access for high-volume programs.",
    features: [
      "Unlimited concept development access",
      "Full concept set per project",
      "Top-priority development queue",
      "Full order tracking & approvals",
      "Dedicated account support",
    ],
  },
};

export function fmt$(cents: number): string {
  if (cents === 0) return "Free";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
}
