"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Answers, Slot } from "@/lib/types";

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
/**
 * What was true when the recommendation was made. Without this the log can say
 * what was ordered but not the mood it was ordered in, which is the only
 * question worth asking of it later.
 */
export interface EventContext {
  mood: Answers["mood"] | null;
  energy: Answers["energy"] | null;
  hunger: Answers["hunger"] | null;
  palate: Answers["palate"] | null;
  patience: Answers["patience"] | null;
  diet: Answers["diet"] | null;
  fasting: boolean;
  weather: string | null;
  temp_c: number | null;
  day_part: string | null;
  interests: string[];
  heat_override: number | null;
}

export function useEventLog(userId: string | null) {
  const supabase = getSupabaseBrowser();

  // A shortlist re-renders for reasons that are not a new recommendation (the
  // heat slider, a city change). Logging every render would drown the signal,
  // so each distinct shortlist is recorded once.
  const loggedShortlists = useRef<Set<string>>(new Set());

  // The shortlist currently on screen: its id, and where each dish sat in it.
  // A click has to be attributable to the same decision that produced the
  // impressions, and to the position the reader actually reached past.
  const current = useRef<{ id: string; ranks: Map<string, number> } | null>(null);

  useEffect(() => {
    // a new session is a new set of impressions
    loggedShortlists.current.clear();
    current.current = null;
  }, [userId]);

  const logShown = useCallback(
    (dishIds: string[], city: string | null, slot: Slot, ctx: EventContext) => {
      if (!userId || !supabase || dishIds.length === 0) return;
      const fingerprint = `${slot}|${city ?? ""}|${ctx.mood ?? ""}|${dishIds.join(",")}`;
      // Same shortlist as last time: keep the existing id so a later click
      // still lands on the decision the impressions were written under.
      if (loggedShortlists.current.has(fingerprint)) return;
      loggedShortlists.current.add(fingerprint);

      const shortlistId = crypto.randomUUID();
      current.current = {
        id: shortlistId,
        ranks: new Map(dishIds.map((id, i) => [id, i + 1])),
      };

      // see useProfile: a discarded builder never issues a request
      supabase
        .from("recommendation_events")
        .insert(
          dishIds.map((dish_id, i) => ({
            user_id: userId,
            dish_id,
            city,
            slot,
            action: "shown" as const,
            rank: i + 1,
            shortlist_id: shortlistId,
            ...ctx,
          })),
        )
        .then(({ error }) => {
          if (error) console.warn("moodbite: could not log impressions", error.message);
        });
    },
    [userId, supabase],
  );

  const logClicked = useCallback(
    (dishId: string, city: string | null, slot: Slot, ctx: EventContext) => {
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
          rank: current.current?.ranks.get(dishId) ?? null,
          shortlist_id: current.current?.id ?? null,
          ...ctx,
        })
        .then(({ error }) => {
          if (error) console.warn("moodbite: could not log click", error.message);
        });
    },
    [userId, supabase],
  );

  return { logShown, logClicked };
}
