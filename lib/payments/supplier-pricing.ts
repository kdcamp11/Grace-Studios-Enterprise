/**
 * Supplier Pricing Utilities
 *
 * Grace Studios marks up all supplier base costs by a configurable
 * percentage (default 3%) before presenting prices to clients.
 *
 * Usage:
 *   const clientPrice = applyMarkup(supplierBasePrice, tenant.supplier_markup_percent);
 */

export const SUPPLIER_MARKUP_DEFAULT = 3.0; // 3%

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
