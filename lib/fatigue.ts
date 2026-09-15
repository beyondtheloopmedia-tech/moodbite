import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

/**
 * What this person has been shown lately, so the engine can stop repeating
 * itself.
 *
 * Read through the reader's own session: the policy on recommendation_events
 * lets somebody see their own rows and nobody else's, so this needs no
 * privileged access and cannot return another person's history even if the
 * filter below were wrong.
 */

/** Nothing older than this counts. Two weeks is long enough to miss a dish. */
const WINDOW_DAYS = 14;

/**
 * How many recent sightings it takes to be fully tired of something.
 *
 * Swept across four answer profiles, counting distinct headline dishes over
 * fourteen evenings of identical answers - where 1 is the reported bug:
 *
 *     saturation   they order it   they never order
 *          2            6.8              5.8
 *          3            7.5              4.3
 *          4            6.3              4.5
 *          6            7.0              3.5
 *
 * 2 wins the case that actually matters. Somebody who clicks is telling us
 * things and gets variety either way; somebody who just looks and leaves is the
 * one staring at the same dish, and that is the person who wrote in. Two is a
 * touch aggressive as a rule - it means twice is already enough - and that is
 * the right side to err on when the failure being fixed is monotony.
 */
const SATURATION = 2;

/**
 * A click counts double.
 *
 * Clicking means they went and ate it, which is a much stronger reason not to
 * suggest it again this week than merely having seen it in a list. Note this
 * runs the opposite way to the learned lift, and deliberately: liking a dish in
 * general and wanting it two nights running are different questions, so
 * long-term taste lives in dish_signals and short-term "not again" lives here.
 */
const CLICK_MULTIPLIER = 2;

export async function dishFatigue(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();

  const { data, error } = await supabase
    .from("recommendation_events")
    .select("dish_id, action, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(600);

  if (error) {
    // A recommendation without this is the recommendation we made before it
    // existed. Never worth failing the request over.
    console.warn("moodbite: could not read dish fatigue", error.message);
    return new Map();
  }

  const now = Date.now();
  const weight = new Map<string, number>();

  for (const e of data ?? []) {
    const days = (now - new Date(e.created_at).getTime()) / 864e5;
    // Linear decay to zero at the window edge, so a dish fades out of the way
    // rather than reappearing abruptly on the fifteenth day.
    const recency = Math.max(0, 1 - days / WINDOW_DAYS);
    const w = recency * (e.action === "clicked" ? CLICK_MULTIPLIER : 1);
    weight.set(e.dish_id, (weight.get(e.dish_id) ?? 0) + w);
  }

  const out = new Map<string, number>();
  for (const [dish, w] of weight) out.set(dish, Math.min(1, w / SATURATION));
  return out;
}
