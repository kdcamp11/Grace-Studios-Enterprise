import Stripe from "stripe";

// Set STRIPE_MODE=test in your environment to use STRIPE_TEST_SECRET_KEY
// instead of STRIPE_SECRET_KEY without removing your live key.
const useTestMode = process.env.STRIPE_MODE === "test";
const activeKey = useTestMode
  ? (process.env.STRIPE_TEST_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "sk_test_missing")
  : (process.env.STRIPE_SECRET_KEY ?? "sk_test_missing");

if (!activeKey || activeKey === "sk_test_missing") {
  console.error("[stripe] No Stripe key configured — payment routes will return 503");
} else if (useTestMode) {
  console.log("[stripe] Running in TEST mode");
}

export const stripe = new Stripe(activeKey, {
  apiVersion: "2026-04-22.dahlia",
});
