"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AuthState =
  | "disabled" // no Supabase configured; the app runs without accounts
  | "loading"
  | "signedOut"
  | "sent" // magic link emailed, waiting on the click
  | "signedIn"
  | "error";

/**
 * Sign-in, kept to one method. A magic link needs no password to store, no
 * OAuth provider to configure, and no reset flow to build.
 */
export function useSession() {
  const [state, setState] = useState<AuthState>(
    isSupabaseConfigured ? "loading" : "disabled",
  );
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user.id ?? null);
      setEmail(data.session?.user.email ?? null);
      setState(data.session ? "signedIn" : "signedOut");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
      setState(session ? "signedIn" : "signedOut");
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const sendLink = useCallback(async (address: string) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setState("loading");
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    // "try again" is the wrong advice when the answer is "wait": Supabase's
    // built-in mailer allows only a couple of sends an hour
    setProblem(
      error?.code === "over_email_send_rate_limit"
        ? "Too many sign-in emails just now. Try again in an hour."
        : error
          ? "That did not send. Try again."
          : null,
    );
    setState(error ? "error" : "sent");
  }, []);

  /**
   * Verify the six digit code from the email.
   *
   * Preferred over the link because a link is a single use URL sitting in an
   * inbox: corporate mail security follows it to inspect it, which spends the
   * token before the reader ever clicks. A code cannot be consumed by being
   * looked at, and needs no PKCE verifier, so it also works when the code is
   * requested on one device and typed on another.
   */
  const verifyCode = useCallback(async (address: string, code: string) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setState("loading");

    // The token's type is whichever template sent it, and the caller cannot
    // know: the Magic Link template issues "magiclink", a first sign-up issues
    // "signup", and a plain email OTP issues "email". Try each; a wrong type is
    // rejected without spending the token.
    const types = ["magiclink", "email", "signup"] as const;
    let error = null as Awaited<ReturnType<typeof supabase.auth.verifyOtp>>["error"];
    for (const type of types) {
      const result = await supabase.auth.verifyOtp({ email: address, token: code, type });
      error = result.error;
      if (!error) break;
    }

    if (error) {
      setProblem("That code did not work. Check it, or send a new one.");
      setState("error");
      return;
    }
    setProblem(null);
    // onAuthStateChange sets signedIn
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signOut();
    setState("signedOut");
  }, []);

  return { state, email, userId, problem, sendLink, verifyCode, signOut };
}
