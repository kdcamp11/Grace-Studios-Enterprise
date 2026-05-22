"use client";

/**
 * OrgLogo — displays the logged-in user's organization branding in the navbar.
 *
 * Resolution order:
 *  1. Client's own org logo    (clients.logo_url)
 *  2. Client's org name text   (clients.name)
 *  3. Studio logo              (tenant.logo_url, set via Admin → Settings)
 *  4. Grace Enterprise logo    (/grace-enterprise-logo.jpeg — always present)
 *
 * For non-client users (admin, designer, supplier) there is no client record,
 * so the component falls straight through to studio branding — exactly what
 * those portals already showed with TenantLogo.
 *
 * The fetch result is cached at module scope so every component instance on
 * the same page shares a single network request. The cache is cleared on full
 * page reload (natural browser behaviour for module state).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/tenant/context";

interface OrgBrand {
  name: string;
  logo_url: string | null;
}

interface Props {
  href?: string;
  /** Tailwind sizing class(es) applied to the img. Defaults to w-[200px] h-auto. */
  className?: string;
}

// ── Module-level session cache ──────────────────────────────────────────────
// "pending" = not yet fetched | null = fetched, no client record | object = fetched, has record
type CacheState = OrgBrand | null | "pending";
let _cache: CacheState = "pending";
const _waiters: Array<(v: OrgBrand | null) => void> = [];

function resolveOrgBrand(cb: (v: OrgBrand | null) => void): void {
  if (_cache !== "pending") { cb(_cache); return; }
  _waiters.push(cb);
  if (_waiters.length > 1) return; // fetch already in-flight

  fetch("/api/client/team")
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { client?: { name: string; logo_url?: string | null } | null } | null) => {
      const c = data?.client;
      _cache = c ? { name: c.name, logo_url: c.logo_url ?? null } : null;
    })
    .catch(() => { _cache = null; })
    .finally(() => {
      const resolved = _cache as OrgBrand | null;
      _waiters.splice(0).forEach((fn) => fn(resolved));
    });
}

/** Call this after a client updates their org to bust the in-memory cache. */
export function invalidateOrgCache(): void {
  _cache = "pending";
}

// ── Component ───────────────────────────────────────────────────────────────
export default function OrgLogo({ href = "/portal", className = "w-[200px] h-auto" }: Props) {
  const tenant = useTenant();

  // "pending" while the fetch is in-flight so we can show a faded placeholder
  const [org, setOrg] = useState<OrgBrand | null | "pending">(() =>
    _cache === "pending" ? "pending" : _cache
  );
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (_cache !== "pending") {
      setOrg(_cache);
      return;
    }
    resolveOrgBrand((v) => setOrg(v));
  }, []);

  const isPending   = org === "pending";
  const clientOrg   = isPending ? null : (org as OrgBrand | null);

  // The Grace Enterprise logo is the guaranteed last-resort fallback.
  // It lives in /public so it's always available with no network dependency.
  const DEFAULT_LOGO = "/grace-enterprise-logo.jpeg";

  // ── Logo src resolution ──────────────────────────────────────────────────
  // 1. Client's own logo (if they've uploaded one)
  // 2. Tenant/studio logo (set via Admin → Settings)
  // 3. Grace Enterprise logo (always present)
  let logoSrc: string = DEFAULT_LOGO;
  if (!imgError) {
    if (clientOrg?.logo_url) {
      logoSrc = clientOrg.logo_url;
    } else if (!clientOrg && tenant.logo_url) {
      // No client record = admin/designer/supplier view → use studio logo
      logoSrc = tenant.logo_url;
    }
    // If there IS a client record but they have no logo, we still show the
    // Grace Enterprise default rather than their name — keeps the navbar
    // visually consistent until they upload their own.
  }

  // ── Display name (used as alt text) ──────────────────────────────────────
  const displayName = clientOrg?.name ?? tenant.name;

  return (
    <Link href={href} className="inline-flex items-center focus:outline-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt={displayName}
        className={`object-contain transition-opacity duration-200 ${
          isPending ? "opacity-50" : "opacity-100"
        } ${className}`}
        onError={() => {
          // If the resolved URL fails, fall all the way back to the local file
          if (logoSrc !== DEFAULT_LOGO) setImgError(true);
        }}
      />
    </Link>
  );
}
