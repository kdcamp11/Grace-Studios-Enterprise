"use client";

import Link from "next/link";
import { useTenant } from "@/lib/tenant/context";

export default function TenantLogo({ className = "h-8", href = "/portal" }: {
  className?: string;
  href?: string;
}) {
  const tenant = useTenant();

  return (
    <Link href={href} className="inline-flex items-center focus:outline-none">
      {tenant.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tenant.logo_url}
          alt={tenant.name}
          className={`w-auto object-contain ${className}`}
        />
      ) : (
        <span className="font-display font-bold tracking-tight text-brand-text" style={{ fontSize: "1.25rem" }}>
          {tenant.name}
        </span>
      )}
    </Link>
  );
}
