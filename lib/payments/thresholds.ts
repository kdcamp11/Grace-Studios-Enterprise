export type PaymentBand = "small" | "hybrid" | "large" | "enterprise";
export type RecommendedMethod = "stripe" | "ach_wire" | "hybrid";

export interface PaymentThresholdInfo {
  band: PaymentBand;
  recommended: RecommendedMethod;
  cardEnabled: boolean;
  headlineText: string;
  subText: string;
}

export function getPaymentThresholdInfo(amount: number): PaymentThresholdInfo {
  if (amount < 1_000) {
    return {
      band: "small",
      recommended: "stripe",
      cardEnabled: true,
      headlineText: "Pay by Card",
      subText: "Secure card payment via Stripe.",
    };
  }
  if (amount < 3_000) {
    return {
      band: "hybrid",
      recommended: "hybrid",
      cardEnabled: true,
      headlineText: "Card or Bank Transfer",
      subText:
        "Both card and bank transfer are available for your order. Choose the option that works best for your organization.",
    };
  }
  if (amount < 10_000) {
    return {
      band: "large",
      recommended: "ach_wire",
      cardEnabled: true,
      headlineText: "Bank Transfer Recommended",
      subText:
        "For larger custom program orders, ACH and wire transfer are recommended for streamlined business payments. Card payment is also available.",
    };
  }
  return {
    band: "enterprise",
    recommended: "ach_wire",
    cardEnabled: false,
    headlineText: "Bank Transfer",
    subText:
      "For enterprise production invoices, bank transfer is standard. Card payments are available upon request — contact your account lead.",
  };
}

export function formatCurrency(amount: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount);
}

export function generateInvoiceNumber(prefix = "INV"): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${datePart}-${rand}`;
}
