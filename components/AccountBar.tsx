"use client";

import { useState } from "react";
import type { AuthState } from "./useSession";

/**
 * Sign-in, and nothing more. There is no signup wall: an account only changes
 * where preferences are kept, so it stays a quiet header link rather than a
 * gate. It says "Sign in" because that is the word people scan for - phrased
 * as "Keep these across devices" it read as a description, not a control, and
 * went unfound.
 */
export default function AccountBar({
  state,
  email,
  problem,
  onSend,
  onVerify,
  onSignOut,
}: {
  state: AuthState;
  email: string | null;
  problem: string | null;
  onSend: (email: string) => void;
  onVerify: (email: string, code: string) => void;
  onSignOut: () => void;
}) {
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);

  // No Supabase configured: the app has no accounts, so say nothing at all.
  if (state === "disabled") return null;

  if (state === "signedIn") {
    return (
      <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-sm text-ink-soft">
        <span className="hidden sm:inline">Saved to {email}</span>
        <button onClick={onSignOut} className="text-ink underline underline-offset-4">
          Sign out
        </button>
      </div>
    );
  }

  if (state === "sent" || (state === "error" && code)) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 6) onVerify(value.trim(), code.trim());
        }}
        className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-sm text-ink-soft"
      >
        <label htmlFor="code" className="sr-only">
          Six digit code from the email
        </label>
        <span>Enter the code from your email</span>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className="w-24 border-b border-ink/40 bg-transparent pb-0.5 tabular-nums text-ink placeholder:text-ink-soft/70 focus:border-ink focus:outline-none"
        />
        <button type="submit" className="text-ink underline underline-offset-4">
          Sign in
        </button>
        {problem ? <span>{problem}</span> : null}
      </form>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-ink underline underline-offset-4"
        title="Optional. Keeps your preferences across devices."
      >
        Sign in
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.includes("@")) onSend(value.trim());
      }}
      className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-sm text-ink-soft"
    >
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        id="email"
        type="email"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="you@example.com"
        className="border-b border-ink/40 bg-transparent pb-0.5 text-ink placeholder:text-ink-soft/70 focus:border-ink focus:outline-none"
      />
      <button type="submit" className="text-ink underline underline-offset-4">
        Send link
      </button>
      {state === "error" && problem ? <span>{problem}</span> : null}
    </form>
  );
}
