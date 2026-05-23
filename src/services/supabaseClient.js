// Supabase connection settings.
//
// These values are intentionally public. Supabase's "anon" key is
// designed to be shipped to the browser — it only grants whatever Row
// Level Security allows, which is why RLS policies (see the SQL files
// under `supabase/migrations/`) are the real security boundary.
// See: https://supabase.com/docs/guides/api/api-keys
//
// If you rotate the project or key, change the constants below. For a
// Vercel deploy you can optionally override at runtime by setting
// `window.__CLUBCAL_CONFIG__` in an inline <script> before this module
// loads (e.g. generated from a Vercel env var at build time).

const BUILT_IN_URL = "https://edcnllalkavncijrewno.supabase.co";
const BUILT_IN_ANON_KEY = "sb_publishable_TGCM03zUEwuO7ibEXBWNfA_VJt-jHOC";

const runtimeConfig = (typeof window !== "undefined" && window.__CLUBCAL_CONFIG__) || {};

export const SUPABASE_URL = runtimeConfig.SUPABASE_URL || BUILT_IN_URL;
export const SUPABASE_ANON_KEY = runtimeConfig.SUPABASE_ANON_KEY || BUILT_IN_ANON_KEY;
export const SUPABASE_FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function isSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_URL.startsWith("https://")) return false;
  if (SUPABASE_URL.includes("YOUR_PROJECT")) return false;
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.length < 20) return false;
  if (SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) return false;
  return true;
}
