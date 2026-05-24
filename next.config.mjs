import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],

  webpack(config, { isServer }) {
    // Three.js / R3F need these browser stubs on the server side
    if (isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    }
    return config;
  },

  async headers() {
    return [
      {
        // Only tighten CSP on routes that don't need WebGL/Three.js
        source: "/((?!jersey-builder).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.sentry.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: https://placehold.co",
              "connect-src 'self' https://*.supabase.co https://api.replicate.com https://delivery.replicate.com https://replicate.delivery wss://*.supabase.co https://*.sentry.io",
              "worker-src blob: 'unsafe-eval'",
            ].join("; "),
          },
        ],
      },
      {
        // jersey-builder needs relaxed CSP for WebGL + Three.js shader compilation
        source: "/jersey-builder",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://*.sentry.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io",
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
