"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    $crisp: unknown[];
    CRISP_WEBSITE_ID: string;
  }
}

/**
 * Loads the Crisp chat widget when NEXT_PUBLIC_CRISP_WEBSITE_ID is set.
 * Get your site ID at https://crisp.chat (free plan available).
 * Add it to Vercel env vars: NEXT_PUBLIC_CRISP_WEBSITE_ID=your-site-id
 */
export default function SupportWidget() {
  const siteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;

  useEffect(() => {
    if (!siteId) return;

    window.$crisp = [];
    window.CRISP_WEBSITE_ID = siteId;

    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount (rare, but defensive)
      document.head.removeChild(script);
    };
  }, [siteId]);

  if (!siteId) return null;
  return null; // Crisp injects its own UI
}
