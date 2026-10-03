"use client";

import { useState } from "react";
import Link from "next/link";
import {
  COOK_BAND_LABEL,
  COOK_GOALS,
  cookBand,
  recipeLinks,
  whatToCook,
  type CookBand,
  type CookGoalId,
} from "@/lib/cooking";
import { DISHES } from "@/lib/dishes";
import type { Diet } from "@/lib/types";

const TIMES: { value: CookBand; label: string }[] = [
  { value: "quick", label: "Half an hour" },
  { value: "medium", label: "An hour" },
  { value: "project", label: "All afternoon" },
];

const DIETS: { value: Diet; label: string }[] = [
  { value: "veg", label: "Veg only" },
  { value: "egg", label: "Veg or egg" },
  { value: "anything", label: "Anything goes" },
];

/**
 * Cooking, rather than ordering.
 *
 * Runs entirely in the browser: the catalogue ships with the app and the
 * matching is a few comparisons, so there is no request to make and nothing to
 * wait for. That also means no quota and no key - unlike the nearby-restaurant
 * panel, this costs nothing per use and cannot be rationed.
 */
export default function CookPicker() {
  const [time, setTime] = useState<CookBand>("medium");
  const [goals, setGoals] = useState<CookGoalId[]>([]);
  const [diet, setDiet] = useState<Diet>("anything");
  const [seen, setSeen] = useState<string[]>([]);
  const [asked, setAsked] = useState(false);

  const results = whatToCook(DISHES, { time, goals, diet, exclude: seen });

  const toggle = (id: CookGoalId) =>
    setGoals((p) => (p.includes(id) ? p.filter((g) => g !== id) : [...p, id]));

  return (
    <div className="w-full">
      <fieldset>
        <legend className="font-display text-xl">How long have you got?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIMES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={time === t.value}
              onClick={() => {
                setTime(t.value);
                setSeen([]);
              }}
              className={`border px-4 py-2 text-sm transition-colors ${
                time === t.value
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/30 text-ink hover:bg-sage-deep"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="font-display text-xl">What are you cooking for?</legend>
        <p className="mt-1 text-sm text-ink-soft">Pick as many as are true, or none.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {COOK_GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              title={g.blurb}
              aria-pressed={goals.includes(g.id)}
              onClick={() => {
                toggle(g.id);
                setSeen([]);
              }}
              className={`border px-3 py-1.5 text-sm transition-colors ${
                goals.includes(g.id)
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/30 text-ink hover:bg-sage-deep"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="font-display text-xl">Anything off the table?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {DIETS.map((d) => (
            <button
              key={d.value}
              type="button"
              aria-pressed={diet === d.value}
              onClick={() => {
                setDiet(d.value);
                setSeen([]);
              }}
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

      {!asked ? (
        <button
          onClick={() => setAsked(true)}
          className="font-display mt-10 bg-ink px-8 py-4 text-lg text-paper transition-colors hover:bg-chilli"
        >
          Tell me what to cook
        </button>
      ) : results.length === 0 ? (
        <div className="mt-10 border-t border-ink/20 pt-8">
          <p className="font-display text-2xl">That is everything that fits.</p>
          <button
            onClick={() => setSeen([])}
            className="mt-4 border-b-2 border-ink pb-1 font-display text-lg"
          >
            Start the list again
          </button>
        </div>
      ) : (
        <div className="mt-10 border-t border-ink/20 pt-8">
          <ul>
            {results.map(({ dish, why }) => {
              const links = recipeLinks(dish);
              return (
                <li key={dish.id} className="border-b border-ink/10 py-6 first:pt-0">
                  <h2 className="font-display text-2xl leading-tight">{dish.name}</h2>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    {dish.cuisine} · {COOK_BAND_LABEL[cookBand(dish)].toLowerCase()}
                    {why.length ? ` · ${why.join(", ")}` : ""}
                  </p>
                  <p className="mt-2 leading-relaxed">{dish.note}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a
                      href={links.youtube}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-ink px-4 py-2 font-display text-sm transition-colors hover:bg-sage-deep"
                    >
                      Watch someone make it
                    </a>
                    <a
                      href={links.web}
                      target="_blank"
                      rel="noreferrer"
                      className="border-b border-ink pb-0.5 text-sm"
                    >
                      Written recipes
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <button
              onClick={() => setSeen((s) => [...s, ...results.map((r) => r.dish.id)])}
              className="font-display border-b-2 border-ink pb-1 text-lg"
            >
              Show me something else
            </button>
            <Link href="/" className="text-sm text-ink-soft underline underline-offset-4">
              Order instead
            </Link>
          </div>

          {/* Said plainly rather than buried: we point at recipes, we do not
              host them. Reproducing somebody's method text would be taking
              their work, and no API serves "the best recipe on the web". */}
          <p className="mt-8 text-xs text-ink-soft">
            Recipes open on YouTube or Google. We pick the dish; the people who
            wrote and filmed the method keep the credit for it.
          </p>
        </div>
      )}
    </div>
  );
}
