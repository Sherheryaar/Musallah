import { createClient, SupabaseClient } from "@supabase/supabase-js";

// .trim() guards against invisible whitespace or a stray "\r" from a .env
// file saved with CRLF line endings -- a trailing carriage return in the URL
// silently breaks every request.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

/**
 * Single shared Supabase client, or null when env vars are missing — in
 * which case there is no place data at all and the offline screen shows
 * (see PlacesContext). No auth features are used.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
