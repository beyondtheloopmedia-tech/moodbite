import { AXES, type Dish, type Vector } from "./types";

/**
 * What one person reaches for, learned from what they actually chose.
 *
 * The six questions ask how somebody feels tonight. Standing preferences ask
 * what they like in general, but only what they thought to tell us. Neither
 * catches the thing a person would never say out loud and demonstrates every
 * week - that they always take the spicier option, or never the sweet one.
 *
 * THE SUBTRACTION IS THE WHOLE IDEA. This is not the average of what they
 * clicked; it is the average of what they clicked MINUS the average of what
 * they were offered. Without that subtraction the engine would learn its own
 * habits: it shows comforting food, so people click comforting food, so it
 * learns they want comforting food. Measuring the gap between what was put in
 * front of somebody and what they took is the only part that carries their
 * opinion rather than ours.
 *
 * Expressed in the same six axes as everything else, so a learned taste is a
 * nudge to the same target vector the answers produce, and the "picked because"
 * line stays true.
 */

/**
 * Clicks needed before this speaks at full volume. Ten is roughly a fortnight
 * of ordering, and below it the delta is scaled down rather than trusted -
 * three clicks say more about three evenings than about a person.
 */
const CONFIDENT_AT = 10;

/**
 * How far a fully confident taste may pull an axis.
 *
 * Small on purpose, and smaller than the weather bias. What somebody usually
 * likes should lose to how they feel tonight, because the entire premise of
 * this product is that the craving is downstream of the mood. A taste model
 * loud enough to overrule the answers would turn six questions into decoration.
 */
const PULL = 0.35;

export interface Taste {
  delta: Partial<Vector>;
  clicks: number;
  confidence: number;
}

export function tasteFrom(
  events: { dish: string; clicked: boolean }[],
  dishById: Map<string, Dish>,
): Taste | null {
  const chosen: Vector[] = [];
  const offered: Vector[] = [];

  for (const e of events) {
    const dish = dishById.get(e.dish);
    if (!dish) continue;
    offered.push(dish.vector);
    if (e.clicked) chosen.push(dish.vector);
  }

  // One click is an anecdote. Two is still an anecdote.
  if (chosen.length < 3 || offered.length < chosen.length) return null;

  const mean = (vs: Vector[], axis: keyof Vector) =>
    vs.reduce((s, v) => s + v[axis], 0) / vs.length;

  const confidence = Math.min(1, chosen.length / CONFIDENT_AT);
  const delta: Partial<Vector> = {};
  for (const axis of AXES) {
    const gap = mean(chosen, axis) - mean(offered, axis);
    delta[axis] = gap * PULL * confidence;
  }

  return { delta, clicks: chosen.length, confidence };
}
