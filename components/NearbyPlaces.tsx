"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/places";
import type { Answers, City } from "@/lib/types";
import type { InterestId } from "@/lib/interests";
import type { CoordsStatus } from "./useCity";

type State =
  | { kind: "loading" }
  | { kind: "done"; places: Place[]; from: "you" | "city" }
  | { kind: "quiet"; message: string; offerLocate?: boolean };

/**
 * Where to actually get the dish that was just recommended.
 *
 * Loads with the result, for the headline dish only. Never for the three under
 * "also close": those are a list to glance at, and four billed calls to furnish
 * a glance is not a trade worth making.
 *
 * It stays true afterwards. Moving city, or the engine picking a different dish
 * underneath it, leaves the list on screen wrong rather than merely stale -
 * restaurants in the city you just left are not an answer to anything - so it
 * re-fetches, debounced, and never while a recommendation is still in flight.
 *
 * What it will not do is demand a location first. The permission dialog landing
 * unbidden on the moment somebody finally gets their answer is a bad trade, so
 * the first load uses whatever is already known - a coordinate if the opening
 * screen got one, the city centroid otherwise - says which of the two it
 * measured from, and offers to sharpen it. That offer is made once. Declining
 * is an answer, and being asked twice is nagging.
 */
export default function NearbyPlaces({
  dishId,
  dishName,
  city,
  coords,
  patience,
  mood,
  hunger,
  interests,
  busy,
  coordsStatus,
  onLocate,
}: {
  dishId: string;
  dishName: string;
  city: City | null;
  coords: { lat: number; lon: number } | null;
  patience: Answers["patience"] | null;
  mood: Answers["mood"] | null;
  hunger: Answers["hunger"] | null;
  interests: InterestId[];
  /** a recommendation is in flight, so the dish underneath is about to change */
  busy: boolean;
  coordsStatus: CoordsStatus;
  /** asks for a coordinate without rewriting the city the reader chose */
  onLocate: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  // Primitives, so an unchanged city that arrives as a new object does not read
  // as a change and spend a call.
  const citySlug = city?.slug ?? null;
  const cityName = city?.name ?? null;
  const lat = coords?.lat ?? null;
  const lon = coords?.lon ?? null;

  // These shape a request but are not, on their own, a reason to buy another
  // one: they re-rank a list rather than making it wrong. Read at call time
  // from a ref so changing them never triggers a fetch by itself.
  const shape = useRef({ patience, mood, hunger, interests });
  useEffect(() => {
    shape.current = { patience, mood, hunger, interests };
  });

  // A slower earlier response must never land on top of a newer one.
  const run = useRef(0);

  const look = useCallback(async () => {
    const ticket = ++run.current;
    setState({ kind: "loading" });
    const settle = (s: State) => {
      if (ticket === run.current) setState(s);
    };
    try {
      const { patience, mood, hunger, interests } = shape.current;
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishId,
          city: citySlug ?? undefined,
          coords: lat !== null && lon !== null ? { lat, lon } : undefined,
          patience,
          mood,
          hunger,
          interests,
        }),
      });
      const data = await res.json();

      if (data.needsLocation) {
        settle({
          kind: "quiet",
          message: "Tell me where you are and I will find somewhere.",
          offerLocate: true,
        });
        return;
      }
      // The budget is a fixed monthly one, so running out is a normal state
      // rather than a fault. Say so plainly and leave the order links alone.
      if (data.capped === "month") {
        settle({
          kind: "quiet",
          message: "That is this month's restaurant lookups used up. The order links still work.",
        });
        return;
      }
      if (data.capped === "day") {
        settle({
          kind: "quiet",
          message: "That is today's restaurant lookups used up. Try again tomorrow.",
        });
        return;
      }
      if (data.off || !Array.isArray(data.places)) {
        settle({ kind: "quiet", message: "Could not reach the restaurant list just now." });
        return;
      }
      if (data.places.length === 0) {
        settle({
          kind: "quiet",
          message: `Nowhere near you came back for ${dishName.toLowerCase()}. The order links still work.`,
        });
        return;
      }
      settle({
        kind: "done",
        places: data.places as Place[],
        from: data.from === "you" ? "you" : "city",
      });
    } catch {
      settle({ kind: "quiet", message: "Could not reach the restaurant list just now." });
    }
  }, [dishId, dishName, citySlug, lat, lon]);

  // What the list on screen is an answer to. When this changes, it is not.
  const signature = `${dishId}|${citySlug ?? ""}|${lat ?? ""},${lon ?? ""}`;
  const fetched = useRef<string | null>(null);

  useEffect(() => {
    // Changing city re-runs the recommendation too, so the dish underneath is
    // about to move. Waiting for that avoids paying for the intermediate state
    // where the city is new and the dish is still the old city's.
    if (busy) return;
    // A sharpening is in flight and will change where we search. Buying a
    // result we are about to throw away is the one thing worth waiting for.
    if (coordsStatus === "asking") return;

    if (fetched.current === signature) return;

    // The first load should feel immediate. Everything after it is debounced,
    // because the city picker is a native select and the heat slider fires on
    // every step - without this, dragging either one buys a handful of calls.
    const delay = fetched.current === null ? 0 : 600;
    const timer = setTimeout(() => {
      fetched.current = signature;
      void look();
    }, delay);
    return () => clearTimeout(timer);
  }, [busy, coordsStatus, signature, look]);

  // Offered once, alongside results that were measured from a city centre
  // rather than from the reader. Withdrawn the moment it is declined.
  const sharpen =
    coordsStatus === "asking" ? (
      <p className="mt-3 text-xs text-ink-soft">Finding you.</p>
    ) : coordsStatus === "idle" ? (
      <button
        onClick={onLocate}
        className="mt-3 border-b border-ink pb-0.5 text-xs transition-colors hover:text-chilli"
      >
        Use my exact location
      </button>
    ) : null;

  if (state.kind === "loading") {
    return <p className="mt-6 text-sm text-ink-soft">Looking around{cityName ? ` ${cityName}` : ""}.</p>;
  }

  if (state.kind === "quiet") {
    return (
      <div className="mt-6">
        <p className="text-sm text-ink-soft">{state.message}</p>
        {state.offerLocate ? sharpen : null}
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-ink/20">
      <p className="pt-6 text-sm text-ink-soft">
        Good at {dishName.toLowerCase()}
        {cityName ? ` in ${cityName}` : ""},{" "}
        {/* Distances are measured from whatever the search was centred on, so
            the label has to say which. Calling a centroid "from you" would be
            wrong by the width of a city. */}
        {state.from === "you"
          ? "nearest to you first"
          : `measured from the middle of ${cityName ?? "the city"}`}
      </p>
      <ul className="mt-2">
        {state.places.map((p) => (
          <li key={p.id} className="border-b border-ink/10 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-lg">{p.name}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {/* Google's own rating, shown exactly as Google reports it.
                      The shrunk figure decides the order and is never displayed
                      as though it were the rating. */}
                  {p.rating !== null ? (
                    <>
                      {p.rating.toFixed(1)}
                      <span aria-hidden> ★</span>{" "}
                      <span className="sr-only">out of 5 from</span>
                      {p.reviews.toLocaleString("en-IN")} review{p.reviews === 1 ? "" : "s"}
                    </>
                  ) : (
                    "Not rated yet"
                  )}
                  {p.priceLevel ? ` · ${"₹".repeat(p.priceLevel)}` : ""}
                  {` · ${p.km} km`}
                  {p.openNow === true ? " · open now" : p.openNow === false ? " · closed now" : ""}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-soft/80">{p.address}</p>
              </div>
              {p.mapsUri ? (
                <a
                  href={p.mapsUri}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 border-b border-ink pb-0.5 text-sm"
                >
                  Directions
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {state.from === "city" ? sharpen : null}
      {/* Required: Places content shown outside a Google map has to say where
          it came from. Not decorative, do not remove. */}
      <p className="mt-3 text-xs text-ink-soft">Places and ratings from Google Maps</p>
    </div>
  );
}
