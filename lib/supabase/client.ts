import { createClient as _createClient, SupabaseClient } from "@supabase/supabase-js";

let instance: SupabaseClient | null = null;

export const createClient = () => {
  if (instance) return instance;
  instance = _createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key"
  );
  return instance;
};
