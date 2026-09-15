import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import type { Database } from "./types";

/**
 * Server client bound to the request's cookies, or null when Supabase is not
 * configured. `cookies()` is async in Next 15 and later, so this is too.
 */
export async function getSupabaseServer() {
  if (!isSupabaseConfigured) return null;
  const store = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies. Harmless when middleware or a
          // route handler is the one refreshing the session.
        }
      },
    },
  });
}
