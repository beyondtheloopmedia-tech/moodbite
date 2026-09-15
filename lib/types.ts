export type Slot = "breakfast" | "lunch" | "snack" | "dinner" | "latenight";
export const SLOTS: Slot[] = ["breakfast", "lunch", "snack", "dinner", "latenight"];
export type Portion = "snack" | "meal" | "feast";
export type Diet = "veg" | "egg" | "anything";

export interface City {
  /** the path segment Zomato uses; see cities.ts, these are verified not derived */
  slug: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * Every dish and every mood reading is expressed in the same 6 axes.
 * That is what makes the matching a distance calculation instead of a pile of if-statements.
 */
export interface Vector {
  comfort: number; // familiar, warm, soothing
  indulgence: number; // rich, fried, cheesy, heavy
  heat: number; // chilli level
  lightness: number; // how easy it sits
  novelty: number; // how far from the usual order
  sweetness: number;
}

export const AXES: (keyof Vector)[] = [
  "comfort",
  "indulgence",
  "heat",
  "lightness",
  "novelty",
  "sweetness",
];

export interface Dish {
  id: string;
  name: string;
  cuisine: string;
  /** what to type into a delivery app to find it */
  searchTerm: string;
  veg: boolean;
  containsEgg: boolean;
  portion: Portion;
  /** typical end-to-end delivery minutes */
  eta: number;
  priceBand: 1 | 2 | 3;
  slots: Slot[];
  /** city slugs this is a signature of, when the cuisine alone does not say so */
  localTo?: string[];
  /** verified Zomato dish-page slug; absent means Zomato has no page for it */
  zomatoDish?: string;
  vector: Vector;
  /** shown on the result card, written as one plain sentence */
  note: string;
}

export interface Answers {
  energy: "empty" | "steady" | "wired";
  mood: "stressed" | "flat" | "fine" | "celebrating";
  hunger: "nibble" | "meal" | "feast";
  palate: "familiar" | "surprise";
  patience: "fast" | "normal" | "relaxed";
  diet: Diet;
}

export interface Recommendation {
  dish: Dish;
  score: number;
  /** the axes that drove the match, strongest first */
  reasons: string[];
  /** a signature dish of the city being ordered from */
  local?: boolean;
}
