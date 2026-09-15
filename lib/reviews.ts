/**
 * What a review actually asks, and what the answers mean.
 *
 * The premise is that one star rating out of five is the thing every
 * competitor already has and it hides the only things worth knowing. So this
 * asks five separate questions, each one somebody genuinely asks before going
 * somewhere, and each one answerable by a person who was there rather than by
 * a person with an opinion.
 *
 * Every axis points the same way: 5 is always good. That sounds obvious and is
 * the easiest thing in a schema like this to get wrong - "wait" is scored as
 * *how quickly you were served*, not as how long you waited, because an
 * average across axes that disagree about direction is meaningless.
 */
export const DIMENSIONS = [
  {
    id: "hygiene",
    label: "Hygiene",
    ask: "How clean was it, honestly?",
    low: "I would not eat there again",
    high: "Spotless, including the washroom",
    /** the whole reason this site exists, so it says so */
    lead: true,
  },
  {
    id: "food",
    label: "Food",
    ask: "Was the food actually good?",
    low: "Not worth ordering",
    high: "I would come back for it",
    lead: false,
  },
  {
    id: "value",
    label: "Value",
    ask: "What you paid against what you got.",
    low: "Overpriced for what it was",
    high: "More than it cost",
    lead: false,
  },
  {
    id: "as_advertised",
    label: "As advertised",
    ask: "Did it match the photos, the menu and the prices?",
    low: "Nothing like the pictures",
    high: "Exactly what was promised",
    lead: false,
  },
  {
    id: "wait",
    label: "Speed",
    ask: "How quickly were you served?",
    low: "Far too long",
    high: "Straight away",
    lead: false,
  },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];
export const DIMENSION_IDS = DIMENSIONS.map((d) => d.id);

/**
 * Facts rather than opinions.
 *
 * Deliberately separate from the scored axes: "is it possible to eat here
 * alone without feeling strange" is not better or worse than its opposite, it
 * is a property, and averaging it would be nonsense. These are the ones people
 * actually check for and no listing site reliably answers.
 */
export const TAGS = [
  { id: "solo", label: "Fine on your own", blurb: "Nobody made it weird to eat alone." },
  { id: "late", label: "Open properly late", blurb: "Still serving when it said it would be." },
  { id: "veg-safe", label: "Veg taken seriously", blurb: "Separate handling, not an afterthought." },
  { id: "quiet", label: "You can hear each other", blurb: "A conversation is possible." },
  { id: "work", label: "Fine to work from", blurb: "Plugs, wifi, nobody hovering." },
  { id: "safe", label: "Felt safe", blurb: "Including late, including alone." },
  { id: "washroom", label: "Washroom you would use", blurb: "The one thing photos never show." },
  { id: "card", label: "Card actually works", blurb: "No 'machine is down' at the till." },
] as const;

export type TagId = (typeof TAGS)[number]["id"];
export const TAG_IDS = TAGS.map((t) => t.id);
export const isTagId = (v: unknown): v is TagId =>
  typeof v === "string" && (TAG_IDS as readonly string[]).includes(v);
export const parseTags = (v: unknown): TagId[] =>
  Array.isArray(v) ? [...new Set(v.filter(isTagId))] : [];

/**
 * How much we actually know about a visit, and the words used to say so.
 *
 * The temptation on a site that promises verified reviews is to describe being
 * signed in as verification. It is not, and calling it that would make the one
 * claim the product rests on a lie. So the weaker level says out loud that it
 * is weak.
 */
export type Evidence = "none" | "located";

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  none: "Unverified",
  located: "Was there",
};

export const EVIDENCE_BLURB: Record<Evidence, string> = {
  none: "Written by a signed-in account. We cannot tell whether they went.",
  located:
    "Their device was at the restaurant when they wrote this. Weak evidence — it shows presence, not a meal — but harder to fake from a sofa.",
};

/** How close counts as being there. Generous: GPS in a city is not surgical. */
export const LOCATED_RADIUS_M = 250;

/**
 * The same shrinkage the nearby-places ranking uses, and for the same reason:
 * five out of five from two reviews is not better than four from two hundred.
 *
 * The prior is deliberately small. Unlike Google we start with nothing, and a
 * prior heavy enough to drown the first ten reviews makes every new listing
 * look identical and useless.
 */
export const PRIOR_REVIEWS = 5;
export const PRIOR_SCORE = 3.5;

export function shrink(mean: number | null, count: number): number {
  if (mean === null || count <= 0) return PRIOR_SCORE;
  const w = count / (count + PRIOR_REVIEWS);
  return w * mean + (1 - w) * PRIOR_SCORE;
}

/** Plain words for a score, because "3.8" tells a reader very little. */
export function verdict(score: number): string {
  if (score >= 4.5) return "Excellent";
  if (score >= 4) return "Good";
  if (score >= 3.25) return "Mixed";
  if (score >= 2.5) return "Poor";
  return "Avoid";
}
