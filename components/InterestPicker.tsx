"use client";

import { INTERESTS, type InterestId } from "@/lib/interests";

/**
 * Optional, and says so. The six questions are the product; this is a thumb on
 * the scale for people who want one.
 */
export default function InterestPicker({
  interests,
  onToggle,
}: {
  interests: InterestId[];
  onToggle: (id: InterestId) => void;
}) {
  return (
    <div>
      <p className="text-sm text-ink-soft">
        Anything you always lean towards? Optional. It nudges; it never decides.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {INTERESTS.map((i) => {
          const on = interests.includes(i.id);
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onToggle(i.id)}
                aria-pressed={on}
                title={i.blurb}
                className={`border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/30 text-ink hover:bg-sage-deep"
                }`}
              >
                {i.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
