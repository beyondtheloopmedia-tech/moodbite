"use client";

import type { City, Recommendation, Slot } from "@/lib/types";
import type { ReactNode } from "react";
import { SLOT_LABEL } from "@/lib/scoring";

export interface ResultItem extends Recommendation {
  links: { swiggy: string; zomato: string };
}

const PORTION_WORD = { snack: "a small plate", meal: "a full meal", feast: "a big spread" } as const;

export default function Results({
  items,
  slot,
  city,
  weatherNote,
  onOrder,
  cityBar,
  heat,
  onHeat,
  onRestart,
  busy,
}: {
  items: ResultItem[];
  slot: Slot;
  city: City | null;
  weatherNote: string | null;
  onOrder: (dishId: string) => void;
  cityBar: ReactNode;
  heat: number | null;
  onHeat: (v: number) => void;
  onRestart: () => void;
  busy: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="max-w-xl">
        <p className="font-display text-3xl leading-tight">
          Nothing in the catalogue fits all of that.
        </p>
        <p className="mt-4 text-ink-soft">
          Loosen the wait time or the diet filter and try again.
        </p>
        <div className="mt-6">{cityBar}</div>
        <button
          onClick={onRestart}
          className="mt-8 border-b-2 border-ink pb-1 font-display text-lg"
        >
          Start over
        </button>
      </div>
    );
  }

  const [top, ...rest] = items;

  return (
    <div className="w-full">
      <p className="text-sm text-ink-soft">
        For {SLOT_LABEL[slot]}
        {city ? ` in ${city.name}` : ""}, going by how you answered
      </p>

      <h2 className="font-display mt-3 text-[clamp(2.5rem,9vw,5rem)] font-semibold leading-[0.95] tracking-tight">
        {top.dish.name}
      </h2>

      <p className="font-display mt-5 max-w-lg text-xl leading-snug text-ink-soft">
        {top.dish.note}
      </p>

      <p className="mt-4 max-w-lg text-[0.95rem] leading-relaxed">
        {top.dish.cuisine}, {PORTION_WORD[top.dish.portion]}, roughly {top.dish.eta} minutes away.
        Picked because it is {top.reasons.join(" and ")}
        {top.local && city ? `, and because it is what ${city.name} does best` : ""}.
      </p>

      {weatherNote ? (
        <p className="mt-3 max-w-lg text-[0.95rem] italic text-ink-soft">{weatherNote}</p>
      ) : null}

      <div className="mt-7 flex flex-wrap gap-3">
        <a
          href={top.links.swiggy}
          target="_blank"
          rel="noreferrer"
          onClick={() => onOrder(top.dish.id)}
          className="bg-ink px-6 py-3 font-display text-base text-paper transition-colors hover:bg-chilli"
        >
          Find it on Swiggy
        </a>
        <a
          href={top.links.zomato}
          target="_blank"
          rel="noreferrer"
          onClick={() => onOrder(top.dish.id)}
          className="border border-ink px-6 py-3 font-display text-base transition-colors hover:bg-sage-deep"
        >
          Find it on Zomato
        </a>
      </div>

      <div className="mt-10 max-w-sm border-t border-ink/20 pt-6">
        <label htmlFor="heat" className="text-sm text-ink-soft">
          Too mild or too hot? Move this and the list rewrites itself.
        </label>
        <input
          id="heat"
          type="range"
          min={0}
          max={100}
          step={5}
          value={heat === null ? 45 : heat * 100}
          onChange={(e) => onHeat(Number(e.target.value) / 100)}
          className="mt-3 w-full"
          disabled={busy}
        />
        <div className="mt-1 flex justify-between text-xs text-ink-soft">
          <span>no chilli</span>
          <span>as hot as it comes</span>
        </div>
      </div>

      {rest.length > 0 && (
        <div className="mt-10 border-t border-ink/20">
          <p className="pt-6 text-sm text-ink-soft">Also close</p>
          <ul className="mt-2">
            {rest.map((r) => (
              <li
                key={r.dish.id}
                className="flex items-baseline justify-between gap-4 border-b border-ink/10 py-4"
              >
                <div>
                  <p className="font-display text-lg">{r.dish.name}</p>
                  <p className="text-sm text-ink-soft">
                    {r.dish.cuisine}, about {r.dish.eta} minutes
                    {r.local && city ? ` · a ${city.name} staple` : ""}
                  </p>
                </div>
                <a
                  href={r.links.swiggy}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => onOrder(r.dish.id)}
                  className="shrink-0 border-b border-ink pb-0.5 text-sm"
                >
                  Order
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 border-t border-ink/20 pt-6">{cityBar}</div>

      <button onClick={onRestart} className="mt-8 border-b-2 border-ink pb-1 font-display text-lg">
        Ask me again
      </button>
    </div>
  );
}
