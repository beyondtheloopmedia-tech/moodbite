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
      // Comfort here means soothing, warm, familiar. Somebody who cannot sit
      // still is not asking to be soothed, they are asking to be met. Without
      // this, the restless answers still landed in the comfort corner: raising
      // heat and novelty does nothing to lower comfort.
      target.comfort -= 0.2;
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
      // A celebration is not a consolation. Leaving comfort at baseline meant
      // every good mood asked for the same soothing food as a bad one.
      target.comfort -= 0.1;
      weights.indulgence += 0.7;
      break;
    case "fine":
      // The only answer that asks for nothing in particular, and it used to be
      // a no-op - which meant the baseline itself was "mildly rich and
      // comforting", so an ordinary Tuesday got a bad day's food.
      target.indulgence -= 0.15;
      target.comfort -= 0.1;
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

  // Asking for a nibble is asking for less, not merely for lighter; asking to be
  // fed properly is asking for a savoury spread. Each used to move one axis,
  // which is part of why neither could reach the edges of the catalogue.
  if (answers.hunger === "nibble") {
    target.lightness += 0.25;
    target.indulgence -= 0.2;
  }
  if (answers.hunger === "feast") {
    target.indulgence += 0.15;
    target.lightness -= 0.2;
    target.sweetness -= 0.1;
  }

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
  signals: Map<string, number> | null = null,
  fatigue: Map<string, number> | null = null,
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
    // Quantity is a statement, not a flavour. "Just a nibble" and "feed me
    // properly" are two steps apart, and something two steps from what was
    // asked for is not a compromise, it is the wrong answer: a snack offered to
    // somebody who said feed me properly reads as the machine not listening.
    //
    // This was a -0.18 penalty, which other terms routinely outbid - the
    // diversity penalty alone reaches 0.8. Measured before: 11.4% of everything
    // shown for "feast" was a snack.
    //
    // Deliberately a filter rather than a bigger penalty, for the same reason
    // diet is: there is no score high enough to make it right.
    .filter((d) => Math.abs(PORTION_ORDER[d.portion] - wantPortion) < 2)
    .map((dish) => {
      const totalWeight = AXES.reduce((s, a) => s + weights[a], 0);
      const distance = AXES.reduce(
        (s, a) => s + weights[a] * Math.abs(target[a] - dish.vector[a]),
        0,
      );
      let score = 1 - distance / totalWeight;

      // Portion fit. Two steps off is filtered out above, so this decides
      // between an exact match and a near one only.
      const gap = Math.abs(PORTION_ORDER[dish.portion] - wantPortion);
      score += gap === 0 ? 0.08 : -0.12;

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

      // What the click stream says about this dish, against what its shown
      // positions predicted. 1 is neutral; an empty log leaves every dish at 1
      // and this line changes nothing.
      if (signals) {
        const lift = signals.get(dish.id);
        if (lift !== undefined) {
          const bounded = Math.max(-LEARNED_CLAMP, Math.min(LEARNED_CLAMP, lift - 1));
          score += bounded * LEARNED;
        }
      }

      // Seen recently. 0 is fresh, 1 is "you have had a lot of this lately".
      if (fatigue) {
        const tired = fatigue.get(dish.id);
        if (tired) score -= Math.min(1, Math.max(0, tired)) * FATIGUE;
      }

      const reasons = AXES.map((a) => ({
        axis: a,
        pull: weights[a] * (1 - Math.abs(target[a] - dish.vector[a])),
        high: dish.vector[a] >= 0.5,
      }))
        .sort((x, y) => y.pull - x.pull)
        .slice(0, 2)
        .map((r) => REASON_TEXT[r.axis][r.high ? 0 : 1]);

      // `score` is the raw comparable number and `shown` is the tidied one.
      // These used to be the same field, which meant the sort ran on a value
      // clipped at 1 and rounded to three decimals: every pair of dishes above
      // 1.0 tied, and so did anything within half a thousandth. Ties then broke
      // on catalogue order, which is not an opinion about food. Order on the
      // real number; round only what is displayed.
      return {
        dish,
        score,
        shown: Math.round(Math.min(1, score) * 1000) / 1000,
        reasons,
        local,
      };
    })
    .sort((a, b) => b.score - a.score);

  return selectShortlist(scored, limit);
}

/**
 * How much a dish is penalised for resembling one already on the shortlist.
 *
 * Taking the top four by score alone produces four near-identical dishes
 * surprisingly often. Measured across all 3,240 answer combinations before
 * this existed: the median shortlist had a mean pairwise axis distance of
 * 0.168, and 36% of them were tighter than 0.15 - four ways of saying the same
 * thing, offered as a choice.
 *
 * Two dishes in the catalogue are shadowed the same way - Greek salad sits
 * 0.067 from the grilled chicken bowl and is faster, poha shadows the fruit and
 * dahi bowl - and it is worth being clear that this does NOT fix that. Measured
 * either side: still 5 to 6 dishes never shown. It cannot, because the higher
 * scorer is chosen first and the penalty then falls on the dish it shadowed,
 * which is backwards for coverage. That is a separate problem with a separate
 * fix.
 *
 * 0.8 comes from a sweep across all 3,240 combinations, not from taste:
 *
 *     weight   near-clone shortlists   cost to picks 2-4
 *       0.00            35.7%                  -
 *       0.45            22.1%               -0.47%
 *       0.80             9.6%               -1.85%
 *       1.00             3.6%               -3.09%
 *
 * 0.8 removes 73% of the clones for under 2% of the runner-ups' score; going
 * to 1.0 triples that cost for six more points. The headline pick costs
 * nothing at any weight, because the first selection has nothing to be
 * penalised against - variety is taken out of the three beneath it, never out
 * of the answer.
 */
const DIVERSITY = 0.8;

/**
 * How much the click stream is allowed to overrule the vectors.
 *
 * The six axes are hand-tagged guesses. What people actually pick is the only
 * evidence that ever disagrees with them, so it has to count for something -
 * but it cannot count for much, for two reasons.
 *
 * It is thin. A few hundred clicks across fifty-one dishes is not enough to
 * overturn a considered judgement about what a dish is like, and a learned
 * term loud enough to do so would make the engine chase noise.
 *
 * And it is self-confirming. Even debiased for position, a dish only earns
 * evidence by being shown, and it is only shown because the vectors already
 * liked it. A large weight would let the engine converge on whatever it
 * happened to favour in its first month and call that learning.
 *
 * Sizing it took measuring rather than taste. At 0.06 the maximum shift was
 * 0.03, and lifting a dish by the full amount changed not one of 3,240
 * shortlists - a term that can never decide anything is decoration. Against the
 * real distribution of score gaps between adjacent candidates:
 *
 *     weight   max shift   share of adjacent pairs it could decide
 *      0.06      0.030                  65%
 *      0.15      0.075                  91%
 *      0.30      0.150                  99.7%
 *
 * 0.15 it is, with the clamp giving a ceiling of +/-0.075 - almost exactly what
 * an exact portion match is worth (0.08). That is the anchor: the click stream
 * gets a say the size of one strong structural signal, and never more. At 0.30
 * it decides essentially every close call, which is not learning, it is the
 * evidence taking the engine over.
 *
 * Worth knowing that selection dampens this further: the diversity penalty
 * reaches 0.8, so between two dishes of differing similarity a 0.075 shift is
 * still often overruled. That is the intended order of authority - what a dish
 * IS, then whether the shortlist is varied, then what people picked.
 */
const LEARNED = 0.15;
const LEARNED_CLAMP = 0.5;

/**
 * How hard to push down something this person has just been shown.
 *
 * Without this the engine has no memory at all, and a deterministic scorer with
 * no memory gives the same answer to the same question forever. Somebody whose
 * honest answers are stable - which is most people, most of the time - gets the
 * identical dish every single visit and reasonably concludes the thing is
 * broken. It is not broken, it is amnesiac, and that is worse: it looks like
 * confidence.
 *
 * Deliberately a penalty rather than an exclusion. A dish you love should be
 * allowed to come back, just not tomorrow. And deliberately NOT randomness: the
 * result still carries a "picked because" line, and a shuffled answer would
 * make that sentence a lie. This is a fact about your last fortnight, so the
 * engine stays as explainable as it was.
 *
 * 0.35 is a large number next to LEARNED at 0.15, and that ordering is the
 * point. What people in general clicked is weak evidence about tonight; what
 * YOU were shown on Tuesday is strong evidence that you do not want it again on
 * Wednesday.
 */
const FATIGUE = 0.35;

/** 1 when two dishes are identical in the six axes, 0 when maximally apart. */
function similarity(a: Vector, b: Vector): number {
  return 1 - AXES.reduce((s, ax) => s + Math.abs(a[ax] - b[ax]), 0) / AXES.length;
}

/**
 * Pick the shortlist: best first, then best-given-what-is-already-there.
 *
 * Maximal marginal relevance. The first pick is simply the top score, so the
 * headline answer is never compromised for variety - what changes is the three
 * beneath it, which stop being restatements of it. The cuisine cap stays as a
 * blunt backstop for the case where the vectors disagree with common sense.
 *
 * Exported so the offline sweep can try other weights without the app's
 * constant moving underneath it.
 */
export function selectShortlist(
  scored: Recommendation[],
  limit: number,
  diversity = DIVERSITY,
): Recommendation[] {
  const picked: Recommendation[] = [];
  const cuisines: Record<string, number> = {};
  const taken = new Set<string>();

  while (picked.length < limit) {
    let best: Recommendation | null = null;
    let bestValue = -Infinity;

    for (const r of scored) {
      if (taken.has(r.dish.id)) continue;
      if ((cuisines[r.dish.cuisine] ?? 0) >= 2) continue;

      // distance from the nearest thing already chosen, not the average: one
      // near-duplicate is enough to make a slot wasted, however different the
      // rest of the list is.
      const closest = picked.reduce(
        (worst, p) => Math.max(worst, similarity(r.dish.vector, p.dish.vector)),
        0,
      );
      const value = r.score - diversity * closest;
      if (value > bestValue) {
        bestValue = value;
        best = r;
      }
    }

    if (!best) break;
    taken.add(best.dish.id);
    cuisines[best.dish.cuisine] = (cuisines[best.dish.cuisine] ?? 0) + 1;
    picked.push(best);
  }

  return picked;
}
