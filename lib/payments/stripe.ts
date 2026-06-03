import Stripe from "stripe";

// Default to test mode. Set STRIPE_MODE=live to switch to the live key.
const useTestMode = process.env.STRIPE_MODE !== "live";
const activeKey = useTestMode
  ? (process.env.STRIPE_TEST_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "sk_test_missing")
  : (process.env.STRIPE_SECRET_KEY ?? "sk_test_missing");

if (!activeKey || activeKey === "sk_test_missing") {
  console.error("[stripe] No Stripe key configured — payment routes will return 503");
} else {
  console.log(`[stripe] Running in ${useTestMode ? "TEST" : "LIVE"} mode`);
}

// True when a real key is configured. Used by route handlers to gate Stripe calls.
export const stripeConfigured = !!(activeKey && activeKey !== "sk_test_missing");

export const stripe = new Stripe(activeKey, {
  apiVersion: "2026-04-22.dahlia",
});
