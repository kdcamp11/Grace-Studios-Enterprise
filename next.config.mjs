import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
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
              // ajax.googleapis.com needed for model-viewer web component CDN
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://*.sentry.io https://ajax.googleapis.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: https://placehold.co",
              // blob: required by model-viewer for internal texture blob URLs
              "connect-src 'self' blob: https://*.supabase.co https://api.replicate.com https://delivery.replicate.com https://replicate.delivery wss://*.supabase.co https://*.sentry.io",
              "worker-src blob: 'unsafe-eval'",
              "child-src blob:",
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
