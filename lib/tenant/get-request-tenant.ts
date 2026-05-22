import { headers } from "next/headers";
import { resolveTenant } from "./resolve";
import type { Tenant } from "@/lib/supabase/types";

export async function getRequestTenant(): Promise<Tenant | null> {
  const headersList = headers();
  const hostname = headersList.get("x-hostname") ?? "localhost:3000";
  return resolveTenant(hostname);
}
