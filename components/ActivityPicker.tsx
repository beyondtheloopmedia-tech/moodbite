"use client";

import type { Activity } from "@/lib/types";

const OPTIONS: { id: Activity; label: string; blurb: string }[] = [
  { id: "watching", label: "Watching something", blurb: "One hand free, nothing that drips." },
  { id: "working", label: "Working", blurb: "Light, and it will not end up on the keyboard." },
  { id: "company", label: "People are over", blurb: "Something worth putting in the middle." },
];

/**
 * What you are doing while you eat.
 *
 * Pro only, and the lock is on the server: the API ignores this field unless
 * the account is entitled, so hiding the control here is presentation, not
 * protection.
 *
 * Most people eat in front of a screen - the consumption-value survey put
 * roughly two thirds at the higher screen-time levels - so this is the common
 * case, not a novelty.
 */
export default function ActivityPicker({
  activity,
  isPro,
  onChange,
}: {
  activity: Activity | null;
  isPro: boolean;
  onChange: (a: Activity | null) => void;
}) {
  if (!isPro) {
    return (
      <div className="text-sm text-ink-soft">
        <span className="text-ink">Doing something while you eat?</span> Moodbite Pro
        matches the food to it — one-handed for a film, nothing messy over a keyboard,
        something to share when people are over.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-soft">What are you doing while you eat?</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const on = activity === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onChange(on ? null : o.id)}
                aria-pressed={on}
                title={o.blurb}
                className={`border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/30 text-ink hover:bg-sage-deep"
                }`}
              >
                {o.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
