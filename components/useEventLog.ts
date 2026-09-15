"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Slot } from "@/lib/types";

/**
 * The click stream: what was put in front of someone, and what they went with.
 *
 * The ratio between those two is the only honest signal for tuning the dish
 * vectors, which are hand-tagged guesses until real choices disagree with them.
 *
 * Signed out there is nowhere to write and nothing is recorded. That is on
 * purpose: rows are owned by a user, and inventing an anonymous identity to log
 * against would be collecting more than the feature needs.
 */
export function useEventLog(userId: string | null) {
  const supabase = getSupabaseBrowser();

  // A shortlist re-renders for reasons that are not a new recommendation (the
  // heat slider, a city change). Logging every render would drown the signal,
  // so each distinct shortlist is recorded once.
  const loggedShortlists = useRef<Set<string>>(new Set());

  useEffect(() => {
    // a new session is a new set of impressions
    loggedShortlists.current.clear();
  }, [userId]);

  const logShown = useCallback(
    (dishIds: string[], city: string | null, slot: Slot) => {
      if (!userId || !supabase || dishIds.length === 0) return;
      const fingerprint = `${slot}|${city ?? ""}|${dishIds.join(",")}`;
      if (loggedShortlists.current.has(fingerprint)) return;
      loggedShortlists.current.add(fingerprint);

      // see useProfile: a discarded builder never issues a request
      supabase
        .from("recommendation_events")
        .insert(
          dishIds.map((dish_id) => ({
            user_id: userId,
            dish_id,
            city,
            slot,
            action: "shown" as const,
          })),
        )
        .then(({ error }) => {
          if (error) console.warn("moodbite: could not log impressions", error.message);
        });
    },
    [userId, supabase],
  );

  const logClicked = useCallback(
    (dishId: string, city: string | null, slot: Slot) => {
      if (!userId || !supabase) return;
      // Not awaited, so it never delays opening the delivery app, but the
      // builder still has to be executed to send anything at all.
      supabase
        .from("recommendation_events")
        .insert({
          user_id: userId,
          dish_id: dishId,
          city,
          slot,
          action: "clicked" as const,
        })
        .then(({ error }) => {
          if (error) console.warn("moodbite: could not log click", error.message);
        });
    },
    [userId, supabase],
  );

  return { logShown, logClicked };
}
