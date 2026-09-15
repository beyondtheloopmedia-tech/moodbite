/**
 * Supabase is optional.
 *
 * Moodbite works with no account and no backend: preferences live in
 * localStorage and nothing on the page depends on a session. These two values
 * being absent is a supported state, not a misconfiguration, so nothing here
 * throws when they are missing and every caller handles null.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
