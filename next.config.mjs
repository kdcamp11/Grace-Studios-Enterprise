import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
// Build: 2026-05-27
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // ajax.googleapis.com: model-viewer CDN
              // gstatic.com: Draco WASM decoder wrapper (loaded as a script by model-viewer)
              // js.stripe.com: Stripe.js (required for Stripe Checkout redirect + 3DS)
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://*.sentry.io https://ajax.googleapis.com https://www.gstatic.com https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: https://placehold.co",
              // blob: + gstatic.com required by model-viewer (Draco WASM decoder + texture blobs)
              // ajax.googleapis.com for model-viewer script + sourcemap
              // api.stripe.com: Stripe API calls; *.stripe.com: Stripe Checkout iframes + 3DS
              "connect-src 'self' blob: https://*.supabase.co https://api.replicate.com https://delivery.replicate.com https://replicate.delivery wss://*.supabase.co https://*.sentry.io https://www.gstatic.com https://ajax.googleapis.com https://api.stripe.com https://*.stripe.com",
              "frame-src https://*.stripe.com https://js.stripe.com",
              "worker-src blob: 'unsafe-eval'",
              "child-src blob: https://*.stripe.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
});
