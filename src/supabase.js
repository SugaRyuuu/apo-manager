import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = "https://plvqfotmiyglkcvrzkzq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_-EFiIAx0f-MRviqxZsNCcA_UgZxC-OG";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function ensureSupabaseSession() {
  return null;
}

export function isMissingTableError(error) {
  return error?.code === "PGRST205";
}
