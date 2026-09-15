import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Where the emailed sign-in link lands.
 *
 * Handles both shapes Supabase sends: `code` for the PKCE flow the browser
 * client uses by default, and `token_hash` + `type` for a plain magic link.
 * Which one arrives depends on the email template, so both are supported
 * rather than betting on one.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.redirect(new URL("/?auth=unconfigured", url.origin));
  }

  let failed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "signup" | "recovery",
      token_hash: tokenHash,
    });
    failed = Boolean(error);
  } else {
    failed = true;
  }

  // Never echo the provider's error text back into the page; it is not useful
  // to the reader and can carry request detail.
  return NextResponse.redirect(new URL(failed ? "/?auth=failed" : "/", url.origin));
}
