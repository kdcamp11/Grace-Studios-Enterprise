import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("[stripe] STRIPE_SECRET_KEY is not set — payment routes will return 503");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_missing", {
  apiVersion: "2026-04-22.dahlia",
});
