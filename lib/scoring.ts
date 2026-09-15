import { CUISINE_HOME } from "./cities";
import type { Weather } from "./weather";
import { INTERESTS, type InterestId } from "./interests";
import { AXES, type Activity, type Answers, type City, type Dish, type Recommendation, type Slot, type SpiceLevel, type Vector } from "./types";

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function slotForHour(hour: number): Slot {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 19) return "snack";
  if (hour >= 19 && hour < 23) return "dinner";
  return "latenight";
}

export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: "morning",
  lunch: "lunch",
  snack: "late afternoon",
  dinner: "dinner",
  latenight: "late night",
};

export type BiasKind = "wet" | "cold" | "hot" | "none";

const BIAS_NOTE: Record<Exclude<BiasKind, "none">, string> = {
  wet: "Leaning warm and heavy, for the rain.",
  cold: "Leaning warm and heavy, for the cold.",
  hot: "Leaning light, for the heat.",
};

/**
 * Weather, reduced to the only three questions the vector space can answer:
 * do you want something warm and heavy, or something light, or neither.
 *
 * Apparent temperature rather than the raw number, because 31 degrees at 80%
 * humidity decides your dinner and 31 degrees in dry heat does not.
 */
export function weatherBias(w?: Weather | null): { kind: BiasKind; note: string } {
  const none = { kind: "none" as const, note: "" };
  if (!w) return none;
  const feels = w.feelsLikeC;

  let kind: BiasKind = "none";
  if (w.condition === "rain" || w.condition === "drizzle" || w.condition === "storm") kind = "wet";
  else if (w.condition === "snow" || feels <= 16) kind = "cold";
  else if (feels >= 34) kind = "hot";
  else if (w.condition === "fog") kind = "cold";

  return kind === "none" ? none : { kind, note: BIAS_NOTE[kind] };
}

/**
 * Fold standing preferences into a profile.
 *
 * Two rules, both learned from watching it get them wrong:
 *
 * Contradictions cancel, including their weight. Picking "keep it light" and
 * "go big" together nets out to roughly no preference on lightness, so the
 * engine must not then weigh lightness harder than it would have with no
 * preference at all. Weight follows the surviving pull, not the sum of the
 * shouting.
 *
 * Stacking has diminishing returns. Six preferences are a description of taste
 * in general, not a claim about tonight, and they should never out-vote the six
 * answers. Dividing by sqrt(n) keeps one strong preference meaningful while
 * stopping six from dominating.
 */
function applyInterests(target: Vector, weights: Vector, interests: InterestId[]) {
  if (interests.length === 0) return;

  const net = {} as Record<keyof Vector, number>;
  const gross = {} as Record<keyof Vector, number>;
  const weightPull = {} as Record<keyof Vector, number>;
  for (const axis of AXES) {
    net[axis] = 0;
    gross[axis] = 0;
    weightPull[axis] = 0;
  }

  for (const id of interests) {
    const interest = INTERESTS.find((i) => i.id === id);
    if (!interest) continue;
    for (const [axis, delta] of Object.entries(interest.target)) {
      net[axis as keyof Vector] += delta as number;
      gross[axis as keyof Vector] += Math.abs(delta as number);
    }
    for (const [axis, delta] of Object.entries(interest.weights)) {
      weightPull[axis as keyof Vector] += delta as number;
    }
  }

  const damp = 1 / Math.sqrt(interests.length);

  for (const axis of AXES) {
    if (gross[axis] === 0) continue;
    // 1 when every preference pulls the same way, 0 when they fully cancel
    const conviction = Math.abs(net[axis]) / gross[axis];
    target[axis] += net[axis] * damp;
    weights[axis] += weightPull[axis] * conviction * damp;
  }
}

interface Profile {
  target: Vector;
  weights: Vector;
  maxEta: number;
}

/**
 * Answers become a point in vector space plus a set of axis weights.
 * Weights matter as much as the target: "surprise me" does not change what
 * novelty you want so much as how much novelty is allowed to decide the answer.
 */
export function buildProfile(
  answers: Answers,
  heatOverride?: number,
  weather?: Weather | null,
  interests: InterestId[] = [],
  activity?: Activity | null,
  spice?: SpiceLevel | null,
): Profile {
  const target: Vector = {
    comfort: 0.5,
    indulgence: 0.5,
    // The one axis where people differ before any question is asked. 0.45 was
    // a guess applied to everybody; a stated tolerance replaces it, and mood,
    // weather and the slider all still move from there.
    heat: spice === "mild" ? 0.2 : spice === "hot" ? 0.75 : 0.45,
    lightness: 0.5,
    novelty: 0.3,
    sweetness: 0.25,
  };
  const weights: Vector = {
    comfort: 1,
    indulgence: 1,
    heat: 0.9,
    lightness: 1,
    novelty: 0.8,
    sweetness: 0.6,
  };

  switch (answers.energy) {
    case "empty":
      target.comfort += 0.3;
      target.indulgence += 0.1;
      target.novelty -= 0.2;
      target.heat -= 0.15;
      weights.comfort += 0.6;
      break;
    case "wired":
      target.heat += 0.25;
      target.novelty += 0.2;
      target.lightness += 0.15;
      weights.heat += 0.4;
      break;
  }

  switch (answers.mood) {
    case "stressed":
      target.comfort += 0.35;
      target.indulgence += 0.15;
      target.novelty -= 0.25;
      // Sweet is the most reported craving under emotional load (60%) and
      // stress the most reported trigger (55%). The two are linked as a
      // stress-reward association rather than being two separate facts, so
      // stress reaches sweetness directly.
      // Saraswat & Harle 2026, IJSRA 18(03) 981-991, tables 2 and 5.
      target.sweetness += 0.2;
      weights.comfort += 0.8;
      weights.novelty += 0.4;
      weights.sweetness += 0.3;
      break;
    case "flat":
      target.indulgence += 0.25;
      target.sweetness += 0.3;
      target.comfort += 0.2;
      weights.indulgence += 0.5;
      weights.sweetness += 0.5;
      break;
    case "celebrating":
      target.indulgence += 0.35;
      target.novelty += 0.2;
      target.heat += 0.15;
      target.lightness -= 0.2;
      weights.indulgence += 0.7;
      break;
  }

  if (answers.palate === "surprise") {
    target.novelty += 0.4;
    weights.novelty += 0.9;
    weights.comfort -= 0.3;
  } else {
    target.novelty -= 0.2;
    weights.novelty += 0.5;
  }

  if (answers.hunger === "nibble") target.lightness += 0.15;
  if (answers.hunger === "feast") target.indulgence += 0.1;

  switch (weatherBias(weather).kind) {
    case "wet":
      target.comfort += 0.2;
      target.indulgence += 0.15;
      target.lightness -= 0.15;
      target.heat += 0.1;
      weights.comfort += 0.4;
      break;
    case "cold":
      target.comfort += 0.25;
      target.indulgence += 0.15;
      target.lightness -= 0.2;
      target.heat += 0.15;
      weights.comfort += 0.4;
      break;
    case "hot":
      target.lightness += 0.25;
      target.indulgence -= 0.2;
      target.heat -= 0.1;
      weights.lightness += 0.5;
      break;
  }

  // Working while eating is the one activity that changes what you want, not
  // just what you can hold: nobody wants to feel heavy halfway through an
  // afternoon. The other two are handled as dish form, below, because
  // "shareable" and "one-handed" are facts about a dish, not flavours.
  if (activity === "working") {
    target.lightness += 0.15;
    target.indulgence -= 0.1;
  }

  applyInterests(target, weights, interests);

  if (heatOverride !== undefined) {
    target.heat = heatOverride;
    weights.heat = 1.8;
  }

  for (const axis of AXES) {
    target[axis] = clamp(target[axis]);
    // floor keeps every axis in play; ceiling stops one axis deciding alone
    weights[axis] = Math.min(2.2, Math.max(0.2, weights[axis]));
  }

  const maxEta = answers.patience === "fast" ? 30 : answers.patience === "normal" ? 45 : 999;
  return { target, weights, maxEta };
}

function dietOk(dish: Dish, diet: Answers["diet"]) {
  if (diet === "anything") return true;
  if (diet === "egg") return dish.veg || dish.containsEgg;
  return dish.veg && !dish.containsEgg;
}

/**
 * A dish is local either because its cuisine is from here, or because it is
 * a city signature the cuisine label does not capture (momos are "Tibetan"
 * everywhere, but they are a Delhi and Kolkata street food).
 */
function isLocal(dish: Dish, city?: City) {
  if (!city) return false;
  if (dish.localTo?.includes(city.slug)) return true;
  return CUISINE_HOME[dish.cuisine]?.includes(city.slug) ?? false;
}

const PORTION_ORDER = { snack: 0, meal: 1, feast: 2 } as const;
const HUNGER_TO_PORTION = { nibble: 0, meal: 1, feast: 2 } as const;

/**
 * Two of these get joined with "and", so none of them may contain one
 * themselves. "familiar and easy" plus "a safe bet" produced "familiar and
 * easy and a safe bet", and a third "and" arrived with the local clause.
 */
const REASON_TEXT: Record<keyof Vector, [string, string]> = {
  comfort: ["familiar", "unfamiliar on purpose"],
  indulgence: ["rich enough to feel like a treat", "deliberately light"],
  heat: ["properly spiced", "gentle on the chilli"],
  lightness: ["easy to sit through", "substantial"],
  novelty: ["off your usual list", "a safe bet"],
  sweetness: ["sweet", "savoury"],
};

export function recommend(
  dishes: Dish[],
  answers: Answers,
  slot: Slot,
  heatOverride?: number,
  limit = 4,
  city?: City,
  weather?: Weather | null,
  interests: InterestId[] = [],
  fasting = false,
  activity: Activity | null = null,
  spice: SpiceLevel | null = null,
  avoidCuisines: string[] = [],
  exclude: string[] = [],
): Recommendation[] {
  const { target, weights, maxEta } = buildProfile(
    answers,
    heatOverride,
    weather,
    interests,
    activity,
    spice,
  );
  // "How hungry?" is answered for one person. When people are over, the order
  // is for several, so the wanted portion moves up a step. Without this the
  // company activity did nothing at all unless "feed me properly" had already
  // been chosen, because there were no feast portions in range to reward.
  const wantPortion = Math.min(
    2,
    HUNGER_TO_PORTION[answers.hunger] + (activity === "company" ? 1 : 0),
  );
  const thrifty = interests.includes("thrifty");

  const scored = dishes
    // Already shown and passed over. Dropped before scoring rather than after,
    // so the two-per-cuisine cap applies to what is actually left rather than
    // being spent on dishes nobody is going to see again.
    .filter((d) => !exclude.includes(d.id))
    .filter((d) => dietOk(d, answers.diet))
    // "I do not eat that" is not a preference to be weighed against flavour.
    .filter((d) => !avoidCuisines.includes(d.cuisine))
    // A vrat is a hard rule, not a preference: an unorderable dish is worse
    // than no suggestion, so this filters rather than nudges.
    //
    // The filter runs both ways. Vrat dishes are deliberately plain - their
    // vectors sit near the middle of the space, which made them win ordinary
    // queries by being the least opinionated thing on the menu - and offering
    // "vrat wale aloo" to someone who is not fasting reads as a mistake.
    .filter((d) => (fasting ? d.fastingSafe === true : d.fastingSafe !== true))
    .filter((d) => d.slots.includes(slot))
    .filter((d) => d.eta <= maxEta)
    .map((dish) => {
      const totalWeight = AXES.reduce((s, a) => s + weights[a], 0);
      const distance = AXES.reduce(
        (s, a) => s + weights[a] * Math.abs(target[a] - dish.vector[a]),
        0,
      );
      let score = 1 - distance / totalWeight;

      // portion fit: exact match rewarded, two steps away penalised hard
      const gap = Math.abs(PORTION_ORDER[dish.portion] - wantPortion);
      score += gap === 0 ? 0.08 : gap === 1 ? -0.04 : -0.18;

      // arriving comfortably inside the patience window is worth a little
      if (maxEta < 900) score += ((maxEta - dish.eta) / maxEta) * 0.03;

      // being a local signature is a nudge, never a filter: every city still
      // gets the whole catalogue, the home team just starts slightly ahead
      const local = isLocal(dish, city);
      if (local) score += 0.05;

      // Price only counts when it has been asked for. PwC's Voice of the
      // Consumer 2025 (India) puts price in the top three purchase factors for
      // 39% and finds 63% concerned about the cost of food, but a silent
      // always-on price bias would quietly reshape everyone's results, so it
      // stays opt-in. priceBand was already on every dish and unread.
      // 0.06 a band puts a cheap dish roughly level with an exact portion
      // match (0.08); at half that the preference was measurable but never
      // actually changed what came back.
      if (thrifty) score += (3 - dish.priceBand) * 0.06;

      // What you are doing decides the form the food has to take. A screen is
      // on and a fork is not welcome; a laptop is open and a dripping roll is
      // worse than useless; people are over and a snack for one is the wrong
      // answer however well it scores on flavour.
      if (activity === "watching") {
        if (dish.handheld) score += 0.09;
        if (dish.messy) score -= 0.09;
      } else if (activity === "working") {
        if (dish.handheld) score += 0.05;
        if (dish.messy) score -= 0.12;
      } else if (activity === "company") {
        if (dish.portion === "feast") score += 0.09;
        if (dish.portion === "snack") score -= 0.06;
      }

      const reasons = AXES.map((a) => ({
        axis: a,
        pull: weights[a] * (1 - Math.abs(target[a] - dish.vector[a])),
        high: dish.vector[a] >= 0.5,
      }))
        .sort((x, y) => y.pull - x.pull)
        .slice(0, 2)
        .map((r) => REASON_TEXT[r.axis][r.high ? 0 : 1]);

      return { dish, score: Math.round(Math.min(1, score) * 1000) / 1000, reasons, local };
    })
    .sort((a, b) => b.score - a.score);

  // keep the shortlist varied: at most two dishes from one cuisine
  const seen: Record<string, number> = {};
  const picked: Recommendation[] = [];
  for (const r of scored) {
    const n = seen[r.dish.cuisine] ?? 0;
    if (n >= 2) continue;
    seen[r.dish.cuisine] = n + 1;
    picked.push(r);
    if (picked.length === limit) break;
  }
  return picked;
}
