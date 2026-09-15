"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/places";
import type { Answers, City } from "@/lib/types";
import type { InterestId } from "@/lib/interests";

type State =
  | { kind: "loading" }
  | { kind: "done"; places: Place[] }
  | { kind: "quiet"; message: string };

/**
 * Where to actually get the dish that was just recommended.
 *
 * Deliberately behind a button rather than loaded with the results. Every one
 * of these is a billed Google call, and firing four of them for a shortlist
 * nobody asked to see is both the expensive way and the rude way to do it. One
 * tap, one call, for the one dish someone is actually considering.
 *
 * Once it is open it stays true, though. Moving city, or the engine picking a
 * different dish underneath it, leaves the list on screen wrong rather than
 * merely stale - restaurants in the city you just left are not an answer to
 * anything - so the panel re-fetches itself. It never does that before the
 * first tap: somebody who never asked for this should never spend a call on it.
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
}) {
  const [opened, setOpened] = useState(false);
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
        settle({ kind: "quiet", message: "Tell me where you are first and I will look again." });
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
      settle({ kind: "done", places: data.places as Place[] });
    } catch {
      settle({ kind: "quiet", message: "Could not reach the restaurant list just now." });
    }
  }, [dishId, dishName, citySlug, lat, lon]);

  // What the list on screen is an answer to. When this changes, it is not.
  const signature = `${dishId}|${citySlug ?? ""}|${lat ?? ""},${lon ?? ""}`;
  const fetched = useRef<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    // Changing city re-runs the recommendation too, so the dish underneath is
    // about to move. Waiting for that avoids paying for the intermediate state
    // where the city is new and the dish is still the old city's.
    if (busy) return;
    if (fetched.current === signature) return;

    // The tap itself should feel immediate. Everything after it is debounced,
    // because the city picker is a native select and the heat slider fires on
    // every step - without this, dragging either one buys a handful of calls.
    const delay = fetched.current === null ? 0 : 600;
    const timer = setTimeout(() => {
      fetched.current = signature;
      void look();
    }, delay);
    return () => clearTimeout(timer);
  }, [opened, busy, signature, look]);

  if (!opened) {
    return (
      <button
        onClick={() => setOpened(true)}
        className="mt-6 border-b border-ink pb-0.5 text-left text-sm transition-colors hover:text-chilli"
      >
        Who does this well near me?
      </button>
    );
  }

  if (state.kind === "loading") {
    return <p className="mt-6 text-sm text-ink-soft">Looking around{cityName ? ` ${cityName}` : ""}.</p>;
  }

  if (state.kind === "quiet") {
    return <p className="mt-6 text-sm text-ink-soft">{state.message}</p>;
  }

  return (
    <div className="mt-8 border-t border-ink/20">
      <p className="pt-6 text-sm text-ink-soft">
        Good at {dishName.toLowerCase()}
        {cityName ? ` in ${cityName}` : ""}, closest and best first
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
      {/* Required: Places content shown outside a Google map has to say where
          it came from. Not decorative, do not remove. */}
      <p className="mt-3 text-xs text-ink-soft">Places and ratings from Google Maps</p>
    </div>
  );
}
