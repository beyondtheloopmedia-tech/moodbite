import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Keeps the Supabase session fresh.
 *
 * A Supabase access token lasts an hour. The browser client refreshes it on its
 * own, but a Server Component cannot write cookies, so the refreshed token
 * never reaches the request: the page keeps reading an expired one and decides
 * the visitor is signed out while the browser still shows them signed in.
 * `/admin` failed exactly that way, an hour after signing in.
 *
 * Refreshing here works because a proxy *can* set cookies on the response.
 *
 * Named `proxy` rather than `middleware`: Next 16 deprecated that convention
 * and renamed the file. The proxy runtime is Node, and cannot be configured.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // This call is the whole point: it refreshes the token when needed, and the
  // setAll above writes the result back so the page that follows can read it.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and images; they carry no session and refreshing on
  // every one of them would be wasted work.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
