"use client";

import { useState } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/tenant/context";

const DEFAULT_LOGO = "/grace-enterprise-logo.jpeg";

export default function TenantLogo({ className = "h-10", href = "/portal" }: {
  className?: string;
  href?: string;
}) {
  const tenant = useTenant();
  const [imgError, setImgError] = useState(false);

  const logoSrc = (!imgError && tenant.logo_url) ? tenant.logo_url : DEFAULT_LOGO;

  return (
    <Link href={href} className="inline-flex items-center focus:outline-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt={tenant.name}
        className={`w-auto object-contain ${className}`}
        onError={() => { if (logoSrc !== DEFAULT_LOGO) setImgError(true); }}
      />
    </Link>
  );
}
