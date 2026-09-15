"use client";

import { useEffect, useRef, useState } from "react";

const DISMISSED_KEY = "moodbite.signInPromptSeen";

/**
 * The one time this app asks for an account.
 *
 * It appears after a recommendation, never before: asking someone to sign in
 * before they have seen what the thing does is how you lose them. It is
 * dismissible, it is remembered, and it never returns - there is still no
 * signup wall, only one invitation.
 */
export default function SignInModal({
  open,
  onDismiss,
  onSignIn,
}: {
  open: boolean;
  onDismiss: () => void;
  onSignIn: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes it, and focus moves in, so it is not a trap for anyone on a
  // keyboard or a screen reader.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        className="w-full max-w-md bg-sage p-6 shadow-lg sm:p-8"
      >
        <h2 id="signin-title" className="font-display text-2xl leading-tight">
          Keep this between devices?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Sign in and your preferences follow you to your phone. No password, just a
          code by email. You can keep using Moodbite without one.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.includes("@")) onSignIn(email.trim());
          }}
          className="mt-6 flex flex-wrap items-baseline gap-3"
        >
          <label htmlFor="modal-email" className="sr-only">
            Email address
          </label>
          <input
            id="modal-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 border-b border-ink/40 bg-transparent pb-1 text-ink placeholder:text-ink-soft/70 focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            className="font-display bg-ink px-5 py-2.5 text-paper transition-colors hover:bg-chilli"
          >
            Send a code
          </button>
        </form>

        <button
          ref={closeRef}
          onClick={onDismiss}
          className="mt-5 text-sm text-ink-soft underline underline-offset-4"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export const signInPromptSeen = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return true; // storage blocked: treat as seen rather than nag every load
  }
};

export const markSignInPromptSeen = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // nothing to do; it simply may appear again next session
  }
};
