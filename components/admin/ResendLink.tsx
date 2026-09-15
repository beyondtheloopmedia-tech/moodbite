"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/**
 * The forgot-password equivalent for an app with no passwords.
 *
 * Sends the user a fresh one-time code. It goes to their address, never to the
 * admin, so this cannot be used to take over an account: an admin can help
 * someone get back in without ever being able to get in as them.
 */
export default function ResendLink() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setProblem(
        error.code === "over_email_send_rate_limit"
          ? "Too many sign-in emails just now. Try again in an hour."
          : "That did not send.",
      );
      setState("error");
      return;
    }
    setProblem(null);
    setState("sent");
  }

  return (
    <form onSubmit={send} className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <label htmlFor="resend" className="sr-only">
        Their email address
      </label>
      <input
        id="resend"
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state !== "idle") setState("idle");
        }}
        placeholder="them@example.com"
        className="border-b border-ink/40 bg-transparent pb-0.5 text-sm text-ink placeholder:text-ink-soft/70 focus:border-ink focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="border-b border-ink pb-0.5 text-sm disabled:opacity-50"
      >
        {state === "sending" ? "Sending" : "Send a code"}
      </button>
      {state === "sent" && <span className="text-sm text-ink-soft">Sent to {email}.</span>}
      {state === "error" && problem && <span className="text-sm text-ink-soft">{problem}</span>}
    </form>
  );
}
