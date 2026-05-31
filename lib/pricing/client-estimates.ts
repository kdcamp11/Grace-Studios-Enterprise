/**
 * lib/pricing/client-estimates.ts
 *
 * Client-facing price range estimates for Managed Production orders.
 * These are offer price ranges — no supplier cost, tier names, or margin data
 * is stored here. Ranges are tiered by quantity so larger orders show
 * better per-set pricing, which helps clients self-qualify and budget.
 *
 * The ranges shown here purposely span ~20% to preserve Grace Studios'
 * operational pricing flexibility before invoice generation.
 */

export interface PriceRange {
  minCents: number;
  maxCents: number;
}

export interface ClientEstimate {
  priceRange:   PriceRange;
  totalRange:   { min: number; max: number };
  depositRange: { min: number; max: number };
  quantity:     number;
  tierLabel:    string;
}

// Client-facing estimate bands. Quantity drives per-set range.
// These represent offer pricing shown to clients before admin review.
const QUANTITY_TIERS: {
  min: number;
  max: number;
  range: PriceRange;
  tierLabel: string;
}[] = [
  { min: 1,   max: 9,        range: { minCents: 6500, maxCents: 9500 }, tierLabel: "Small Run" },
  { min: 10,  max: 24,       range: { minCents: 4500, maxCents: 5500 }, tierLabel: "Team Order" },
  { min: 25,  max: 49,       range: { minCents: 3800, maxCents: 4800 }, tierLabel: "Program Order" },
  { min: 50,  max: 99,       range: { minCents: 3200, maxCents: 4200 }, tierLabel: "Large Program" },
  { min: 100, max: Infinity, range: { minCents: 2800, maxCents: 3800 }, tierLabel: "Enterprise Program" },
];

export function getClientEstimate(quantity: number): ClientEstimate | null {
  if (!quantity || quantity < 1 || !Number.isFinite(quantity)) return null;
  const q    = Math.floor(quantity);
  const tier = QUANTITY_TIERS.find((t) => q >= t.min && q <= t.max);
  if (!tier) return null;
  const totalMin = tier.range.minCents * q;
  const totalMax = tier.range.maxCents * q;
  return {
    priceRange:   tier.range,
    totalRange:   { min: totalMin, max: totalMax },
    depositRange: { min: Math.ceil(totalMin / 2), max: Math.ceil(totalMax / 2) },
    quantity:     q,
    tierLabel:    tier.tierLabel,
  };
}

/** Format a single cents amount as USD, no trailing .00 */
export function fmtEst(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Format a low–high cents range. perSet=true appends " / set" */
export function fmtRange(minCents: number, maxCents: number, perSet = false): string {
  return perSet
    ? `${fmtEst(minCents)}–${fmtEst(maxCents)} / set`
    : `${fmtEst(minCents)}–${fmtEst(maxCents)}`;
}
