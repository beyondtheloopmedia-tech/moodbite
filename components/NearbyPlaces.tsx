"use client";

import { useCallback, useState } from "react";
import type { Place } from "@/lib/places";
import type { Answers, City } from "@/lib/types";
import type { InterestId } from "@/lib/interests";

type State =
  | { kind: "idle" }
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
}: {
  dishId: string;
  dishName: string;
  city: City | null;
  coords: { lat: number; lon: number } | null;
  patience: Answers["patience"] | null;
  mood: Answers["mood"] | null;
  hunger: Answers["hunger"] | null;
  interests: InterestId[];
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const look = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dishId, city: city?.slug, coords, patience, mood, hunger, interests }),
      });
      const data = await res.json();

      if (data.needsLocation) {
        setState({ kind: "quiet", message: "Tell me where you are first and I will look again." });
        return;
      }
      // The budget is a fixed monthly one, so running out is a normal state
      // rather than a fault. Say so plainly and leave the order links alone.
      if (data.capped === "month") {
        setState({
          kind: "quiet",
          message: "That is this month's restaurant lookups used up. The order links still work.",
        });
        return;
      }
      if (data.capped === "day") {
        setState({
          kind: "quiet",
          message: "That is today's restaurant lookups used up. Try again tomorrow.",
        });
        return;
      }
      if (data.off || !Array.isArray(data.places)) {
        setState({ kind: "quiet", message: "Could not reach the restaurant list just now." });
        return;
      }
      if (data.places.length === 0) {
        setState({
          kind: "quiet",
          message: `Nowhere near you came back for ${dishName.toLowerCase()}. The order links still work.`,
        });
        return;
      }
      setState({ kind: "done", places: data.places as Place[] });
    } catch {
      setState({ kind: "quiet", message: "Could not reach the restaurant list just now." });
    }
  }, [dishId, dishName, city, coords, patience, mood, hunger, interests]);

  if (state.kind === "idle") {
    return (
      <button
        onClick={look}
        className="mt-6 border-b border-ink pb-0.5 text-left text-sm transition-colors hover:text-chilli"
      >
        Who does this well near me?
      </button>
    );
  }

  if (state.kind === "loading") {
    return <p className="mt-6 text-sm text-ink-soft">Looking around{city ? ` ${city.name}` : ""}.</p>;
  }

  if (state.kind === "quiet") {
    return <p className="mt-6 text-sm text-ink-soft">{state.message}</p>;
  }

  return (
    <div className="mt-8 border-t border-ink/20">
      <p className="pt-6 text-sm text-ink-soft">
        Good at {dishName.toLowerCase()}, closest and best first
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
