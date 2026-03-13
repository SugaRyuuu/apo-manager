import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = "https://plvqfotmiyglkcvrzkzq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_-EFiIAx0f-MRviqxZsNCcA_UgZxC-OG";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export async function ensureSupabaseSession() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }
  if (sessionData.session) {
    return sessionData.session;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  return data.session;
}

export function isMissingTableError(error) {
  return error?.code === "PGRST205";
}
