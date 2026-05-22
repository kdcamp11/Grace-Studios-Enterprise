"use client";

import { createContext, useContext } from "react";
import type { Tenant } from "@/lib/supabase/types";

export type TenantContextValue = {
  tenant: Tenant;
};

export const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenant(): Tenant {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx.tenant;
}
