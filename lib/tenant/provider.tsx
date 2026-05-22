"use client";

import { TenantContext } from "./context";
import type { Tenant } from "@/lib/supabase/types";

interface Props {
  tenant: Tenant;
  children: React.ReactNode;
}

// Brand colors are fixed to platform defaults defined in globals.css.
// Per-tenant color customisation has been removed — only the logo changes.
export function TenantProvider({ tenant, children }: Props) {
  return (
    <TenantContext.Provider value={{ tenant }}>
      {children}
    </TenantContext.Provider>
  );
}
