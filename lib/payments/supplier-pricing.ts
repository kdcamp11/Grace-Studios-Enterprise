/**
 * Supplier Pricing Utilities
 *
 * Grace Studios marks up all supplier base costs by a configurable
 * percentage (default 10%) before presenting prices to clients.
 *
 * Also contains production pricing tiers for per-set uniform costing:
 *   Standard: $25/set · Premium: $50/set
 *   50% deposit on order, 50% balance before QC release.
 *
 * Usage:
 *   const clientPrice = applyMarkup(supplierBasePrice, tenant.supplier_markup_percent);
 *   const pricing = calcProductionPricing("standard", 25); // 25 sets × $25
 */

// ── Production pricing tiers ──────────────────────────────────────────────────

export const PRODUCTION_PRICING_TIERS = {
  standard: { label: "Standard",  price_per_set_cents: 2500 }, // $25.00/set
  premium:  { label: "Premium",   price_per_set_cents: 5000 }, // $50.00/set
} as const;

export type ProductionPricingTier = keyof typeof PRODUCTION_PRICING_TIERS;

export interface ProductionPricingCalc {
  tier:               ProductionPricingTier;
  quantity:           number;
  price_per_set_cents: number;
  total_cents:         number;
  deposit_cents:       number;
  balance_cents:       number;
}

export function calcProductionPricing(
  tier: ProductionPricingTier,
  quantity: number,
): ProductionPricingCalc {
  const price_per_set_cents = PRODUCTION_PRICING_TIERS[tier].price_per_set_cents;
  const total_cents         = price_per_set_cents * quantity;
  const deposit_cents       = Math.ceil(total_cents / 2);
  const balance_cents       = total_cents - deposit_cents;
  return { tier, quantity, price_per_set_cents, total_cents, deposit_cents, balance_cents };
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(cents / 100);
}



export const SUPPLIER_MARKUP_DEFAULT = 10.0; // 10%

/**
 * Apply a percentage markup to a supplier base price.
 * Returns the client-facing price rounded to 2 decimal places.
 *
 * @param basePrice      Raw supplier cost (dollars)
 * @param markupPercent  Markup percentage, e.g. 3.0 = 3%
 */
export function applyMarkup(basePrice: number, markupPercent: number = SUPPLIER_MARKUP_DEFAULT): number {
  if (basePrice <= 0) return 0;
  const multiplier = 1 + markupPercent / 100;
  return Math.round(basePrice * multiplier * 100) / 100;
}

/**
 * Strip markup back to the supplier base price.
 * Useful for reconciliation or margin reporting.
 */
export function stripMarkup(clientPrice: number, markupPercent: number = SUPPLIER_MARKUP_DEFAULT): number {
  if (clientPrice <= 0) return 0;
  const multiplier = 1 + markupPercent / 100;
  return Math.round((clientPrice / multiplier) * 100) / 100;
}

/**
 * Calculate the markup dollar amount on a given base price.
 */
export function markupAmount(basePrice: number, markupPercent: number = SUPPLIER_MARKUP_DEFAULT): number {
  return Math.round(basePrice * (markupPercent / 100) * 100) / 100;
}

/**
 * Format a price as USD currency string.
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style:    "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Build a pricing summary for display in admin invoicing UI.
 * Shows base cost, markup amount, and final client price.
 */
export interface PricingSummary {
  basePrice:     number;
  markupPercent: number;
  markupAmount:  number;
  clientPrice:   number;
  formatted: {
    basePrice:    string;
    markupAmount: string;
    clientPrice:  string;
  };
}

export function buildPricingSummary(
  basePrice: number,
  markupPercent: number = SUPPLIER_MARKUP_DEFAULT,
): PricingSummary {
  const markup = markupAmount(basePrice, markupPercent);
  const client = applyMarkup(basePrice, markupPercent);
  return {
    basePrice,
    markupPercent,
    markupAmount:  markup,
    clientPrice:   client,
    formatted: {
      basePrice:    formatPrice(basePrice),
      markupAmount: formatPrice(markup),
      clientPrice:  formatPrice(client),
    },
  };
}
