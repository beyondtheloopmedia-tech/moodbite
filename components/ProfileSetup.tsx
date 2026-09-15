"use client";

import { useState } from "react";
import { CITIES } from "@/lib/cities";
import { INTERESTS, type InterestId } from "@/lib/interests";
import type { Diet } from "@/lib/types";

const DIETS: { value: Diet; label: string }[] = [
  { value: "veg", label: "Veg only" },
  { value: "egg", label: "Veg or egg" },
  { value: "anything", label: "Anything goes" },
];

/**
 * Shown once, straight after a first sign-in.
 *
 * It fills `home_city` and `diet`, which existed in the schema from the start
 * and which nothing ever wrote. Every field is skippable: the six questions
 * remain the product, and this is a shortcut for returning users, not a
 * gate in front of them.
 */
export default function ProfileSetup({
  initialInterests,
  initialCity,
  onSave,
  onSkip,
}: {
  initialInterests: InterestId[];
  initialCity: string | null;
  onSave: (v: { homeCity: string | null; diet: Diet | null; interests: InterestId[] }) => void;
  onSkip: () => void;
}) {
  const [homeCity, setHomeCity] = useState(initialCity ?? "");
  const [diet, setDiet] = useState<Diet | "">("");
  const [interests, setInterests] = useState<InterestId[]>(initialInterests);
  const [saving, setSaving] = useState(false);

  const toggle = (id: InterestId) =>
    setInterests((p) => (p.includes(id) ? p.filter((i) => i !== id) : [...p, id]));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        className="w-full max-w-lg bg-sage p-6 shadow-lg sm:p-8"
      >
        <h2 id="setup-title" className="font-display text-2xl leading-tight">
          Set up your profile
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          So you can skip some of this next time. All of it is optional.
        </p>

        <div className="mt-6">
          <label htmlFor="setup-city" className="text-sm text-ink-soft">
            Where you usually order
          </label>
          <select
            id="setup-city"
            value={homeCity}
            onChange={(e) => setHomeCity(e.target.value)}
            className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-ink focus:border-ink focus:outline-none"
          >
            <option value="">No default</option>
            {CITIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm text-ink-soft">Anything off the table?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDiet(diet === d.value ? "" : d.value)}
                aria-pressed={diet === d.value}
                className={`border px-3 py-1.5 text-sm transition-colors ${
                  diet === d.value
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/30 text-ink hover:bg-sage-deep"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm text-ink-soft">Anything you lean towards?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => toggle(i.id)}
                aria-pressed={interests.includes(i.id)}
                title={i.blurb}
                className={`border px-3 py-1.5 text-sm transition-colors ${
                  interests.includes(i.id)
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/30 text-ink hover:bg-sage-deep"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            onClick={async () => {
              setSaving(true);
              await onSave({
                homeCity: homeCity || null,
                diet: diet || null,
                interests,
              });
              setSaving(false);
            }}
            disabled={saving}
            className="font-display bg-ink px-6 py-3 text-paper transition-colors hover:bg-chilli disabled:opacity-60"
          >
            {saving ? "Saving" : "Save"}
          </button>
          <button onClick={onSkip} className="text-sm text-ink-soft underline underline-offset-4">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
