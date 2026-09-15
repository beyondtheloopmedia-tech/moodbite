"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Answers, Slot } from "@/lib/types";
import { deviceId, remember } from "@/lib/device";

/**
 * The click stream: what was put in front of someone, and what they went with.
 *
 * The ratio between those two is the only honest signal for tuning the dish
 * vectors, which are hand-tagged guesses until real choices disagree with them.
 *
 * Signed out, rows are written against an opaque device id instead of a user.
 * That used to be refused on the grounds that inventing an identity collects
 * more than the feature needs - but the id has nothing behind it, and the cost
 * of the old position was concrete: the engine learned only from the small
 * minority with accounts, which is both thin and biased toward the already
 * committed.
 *
 * Every impression is also written to the device's own memory, which is what
 * lets a signed-out reader stop being shown the same dish every visit. That
 * copy never reaches the server as anything but the request that needs it; see
 * lib/device.ts.
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
  activity: string | null;
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

  // `userId` is null for a signed-out reader, which is a valid author now
  // rather than a reason to record nothing.

  const logShown = useCallback(
    (dishIds: string[], city: string | null, slot: Slot, ctx: EventContext) => {
      if (dishIds.length === 0) return;
      const device = userId ? null : deviceId();
      // Remembered locally whether or not there is anywhere to write to: the
      // device's memory is what keeps the suggestions moving, and it must not
      // depend on the database being reachable.
      if (!userId) remember(dishIds.map((d) => ({ d, t: Date.now() })));
      if (!supabase || (!userId && !device)) return;
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
            device_id: device,
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
      const device = userId ? null : deviceId();
      if (!userId) remember([{ d: dishId, t: Date.now(), c: 1 }]);
      if (!supabase || (!userId && !device)) return;
      // Not awaited, so it never delays opening the delivery app, but the
      // builder still has to be executed to send anything at all.
      supabase
        .from("recommendation_events")
        .insert({
          user_id: userId,
          device_id: device,
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
