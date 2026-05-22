import { createClient } from "@/lib/supabase/client";

export type UserRole = "client" | "supplier" | "admin" | "super_admin" | "designer" | "sales_rep";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  company: string | null;
  created_at: string;
}

/** Fetch the current user's profile row. Returns null if not logged in. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

/** Return the home portal path for a given role. */
export function rolePortal(role: UserRole): string {
  if (role === "super_admin") return "/super-admin";
  if (role === "admin")       return "/admin";
  if (role === "supplier")    return "/supplier";
  if (role === "designer")    return "/designer";
  if (role === "sales_rep")   return "/sales";
  return "/portal";
}
