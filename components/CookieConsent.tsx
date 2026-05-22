"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "ga_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      // localStorage unavailable (SSR guard)
    }
  }, []);

  function accept() {
    try { localStorage.setItem(STORAGE_KEY, "accepted"); } catch { /* ignore */ }
    setVisible(false);
  }

  function decline() {
    try { localStorage.setItem(STORAGE_KEY, "declined"); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
    >
      <div className="max-w-2xl mx-auto bg-brand-surface border border-brand-border rounded-xl shadow-2xl p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-1">Cookies &amp; Privacy</p>
          <p className="text-sm font-barlow text-brand-muted leading-relaxed">
            We use essential cookies to operate this platform. We do not use advertising or tracking cookies.
            By continuing, you agree to our{" "}
            <Link href="/privacy-policy" className="text-brand-text underline underline-offset-2 hover:text-brand-primary transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={decline}
            className="px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-widest bg-brand-primary text-brand-bg hover:bg-brand-secondary transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
