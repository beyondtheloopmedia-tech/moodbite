"use client";

import { useState } from "react";
import { CITIES } from "@/lib/cities";
import { INTERESTS, type InterestId } from "@/lib/interests";
import { DISHES } from "@/lib/dishes";
import type { Diet, SpiceLevel } from "@/lib/types";

const CUISINES = [...new Set(DISHES.map((d) => d.cuisine))].sort();

const SPICE: { value: SpiceLevel; label: string }[] = [
  { value: "mild", label: "Keep it mild" },
  { value: "medium", label: "Middle of the road" },
  { value: "hot", label: "Bring the heat" },
];

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
  initialSpice,
  initialAvoid,
  onSave,
  onSkip,
}: {
  initialInterests: InterestId[];
  initialCity: string | null;
  initialSpice: SpiceLevel | null;
  initialAvoid: string[];
  onSave: (v: {
    homeCity: string | null;
    diet: Diet | null;
    interests: InterestId[];
    spice: SpiceLevel | null;
    avoidCuisines: string[];
  }) => void;
  onSkip: () => void;
}) {
  const [homeCity, setHomeCity] = useState(initialCity ?? "");
  const [diet, setDiet] = useState<Diet | "">("");
  const [interests, setInterests] = useState<InterestId[]>(initialInterests);
  const [spice, setSpice] = useState<SpiceLevel | "">(initialSpice ?? "");
  const [avoid, setAvoid] = useState<string[]>(initialAvoid);
  const [saving, setSaving] = useState(false);

  const toggleAvoid = (c: string) =>
    setAvoid((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

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
          Your usual
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Set once and the six questions get shorter every time after. All of it is
          optional, and all of it can be changed later.
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
          <legend className="text-sm text-ink-soft">How much heat do you take?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SPICE.map((sp) => (
              <button
                key={sp.value}
                type="button"
                onClick={() => setSpice(spice === sp.value ? "" : sp.value)}
                aria-pressed={spice === sp.value}
                className={`border px-3 py-1.5 text-sm transition-colors ${
                  spice === sp.value
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/30 text-ink hover:bg-sage-deep"
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm text-ink-soft">
            Anything you would rather never see?
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CUISINES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleAvoid(c)}
                aria-pressed={avoid.includes(c)}
                className={`border px-2.5 py-1 text-sm transition-colors ${
                  avoid.includes(c)
                    ? "border-ink bg-ink text-paper line-through"
                    : "border-ink/30 text-ink hover:bg-sage-deep"
                }`}
              >
                {c}
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
                spice: spice || null,
                avoidCuisines: avoid,
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
