"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import type { Database } from "./types";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * The browser client, or null when Supabase is not configured.
 *
 * Null is a normal answer here, not a failure: callers fall back to
 * localStorage and the app behaves exactly as it does without an account.
 */
export function getSupabaseBrowser() {
  if (!isSupabaseConfigured) return null;
  cached ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
  return cached;
}
