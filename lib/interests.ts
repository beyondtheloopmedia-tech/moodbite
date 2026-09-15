import type { Vector } from "./types";

export type InterestId =
  | "spice"
  | "sweet"
  | "light"
  | "adventurous"
  | "comfort"
  | "rich"
  | "thrifty";

/**
 * Standing preferences, as opposed to how you happen to feel tonight.
 *
 * They are expressed in the same six axes as everything else, so a profile is
 * not a new system bolted on: it is a nudge to the same target vector the six
 * answers produce. Deliberately weaker than the answers, because the whole
 * premise is that tonight's mood beats a preference you set once.
 */
export const INTERESTS: {
  id: InterestId;
  label: string;
  blurb: string;
  target: Partial<Vector>;
  weights: Partial<Vector>;
}[] = [
  {
    id: "spice",
    label: "Chilli, always",
    blurb: "Bias towards food that fights back.",
    target: { heat: 0.22 },
    weights: { heat: 0.5 },
  },
  {
    id: "sweet",
    label: "Sweet tooth",
    blurb: "There is usually room for dessert.",
    target: { sweetness: 0.25 },
    weights: { sweetness: 0.4 },
  },
  {
    id: "light",
    label: "Keep it light",
    blurb: "Nothing that needs a lie-down afterwards.",
    target: { lightness: 0.22, indulgence: -0.18 },
    weights: { lightness: 0.5 },
  },
  {
    id: "adventurous",
    label: "Try anything once",
    blurb: "Lean towards the unfamiliar.",
    target: { novelty: 0.25, comfort: -0.1 },
    weights: { novelty: 0.5 },
  },
  {
    id: "comfort",
    label: "Comfort over novelty",
    blurb: "The usual, done well.",
    target: { comfort: 0.22, novelty: -0.15 },
    weights: { comfort: 0.5 },
  },
  {
    id: "thrifty",
    label: "Watching the spend",
    blurb: "Lean towards the cheaper end of the menu.",
    // Price is not a vector axis, it is a property of the dish. This entry
    // carries no axis deltas; recommend() reads it directly and applies a
    // price fit, the same way it handles portion fit.
    target: {},
    weights: {},
  },
  {
    id: "rich",
    label: "Go big",
    blurb: "Rich, generous, worth the calories.",
    target: { indulgence: 0.22, lightness: -0.15 },
    weights: { indulgence: 0.4 },
  },
];

export const INTEREST_IDS = INTERESTS.map((i) => i.id);

export const isInterestId = (v: unknown): v is InterestId =>
  typeof v === "string" && (INTEREST_IDS as string[]).includes(v);

/** Drops anything unrecognised, so stored data can never widen the type. */
export const parseInterests = (v: unknown): InterestId[] =>
  Array.isArray(v) ? v.filter(isInterestId) : [];
