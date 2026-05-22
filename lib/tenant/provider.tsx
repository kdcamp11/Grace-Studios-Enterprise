"use client";

import { useEffect } from "react";
import { TenantContext } from "./context";
import type { Tenant } from "@/lib/supabase/types";

interface Props {
  tenant: Tenant;
  children: React.ReactNode;
}

export function TenantProvider({ tenant, children }: Props) {
  // Inject brand CSS variables so every component can use them via Tailwind or inline styles
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary",   tenant.brand_primary);
    root.style.setProperty("--brand-secondary",  tenant.brand_secondary);
    root.style.setProperty("--brand-bg",         tenant.brand_bg);
    root.style.setProperty("--brand-surface",    tenant.brand_surface);
    root.style.setProperty("--brand-border",     tenant.brand_border);
    root.style.setProperty("--brand-text",       tenant.brand_text);
    root.style.setProperty("--brand-muted",      tenant.brand_muted);
  }, [tenant]);

  return (
    <TenantContext.Provider value={{ tenant }}>
      {children}
    </TenantContext.Provider>
  );
}
