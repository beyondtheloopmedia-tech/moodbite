"use client";

import type { City } from "@/lib/types";
import type { CityStatus } from "./useCity";

/**
 * One line of state about where the order is going, and the controls to fix it.
 * Deliberately quiet: it is context for the recommendation, not the point of
 * the page, so it never becomes a gate in front of the quiz.
 */
export default function CityBar({
  city,
  status,
  km,
  cities,
  radiusKm,
  onLocate,
  onChoose,
}: {
  city: City | null;
  status: CityStatus;
  km: number | null;
  cities: City[];
  radiusKm: number;
  onLocate: () => void;
  onChoose: (slug: string) => void;
}) {
  const picker = (
    <select
      value={city?.slug ?? ""}
      onChange={(e) => onChoose(e.target.value)}
      aria-label="Choose your city"
      className="border-b border-ink/40 bg-transparent pb-0.5 text-sm text-ink focus:outline-none focus:border-ink"
    >
      <option value="" disabled>
        Pick a city
      </option>
      {cities.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.name}
        </option>
      ))}
    </select>
  );

  // once there is a city the picker carries its name, so the label does not
  // repeat it back ("Ordering in Mumbai [Mumbai]")
  if (city) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-soft">
        <span>Ordering in</span>
        {picker}
        {status === "located" ? <span>· from your location</span> : null}
      </div>
    );
  }

  if (status === "locating") {
    return <p className="text-sm text-ink-soft">Finding you.</p>;
  }

  if (status === "far") {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span>
          You are more than {radiusKm} km from anywhere we have links for
          {km !== null ? ` (nearest is ${km} km away)` : ""}.
        </span>
        {picker}
      </div>
    );
  }

  if (status === "denied" || status === "unavailable") {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span>
          {status === "denied"
            ? "No location, that is fine."
            : "Could not read your location."}
        </span>
        {picker}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-ink-soft">
      <button onClick={onLocate} className="text-ink underline underline-offset-4">
        Use my location
      </button>
      <span aria-hidden>or</span>
      {picker}
    </div>
  );
}
