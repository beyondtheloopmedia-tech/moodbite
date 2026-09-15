export type Slot = "breakfast" | "lunch" | "snack" | "dinner" | "latenight";
export const SLOTS: Slot[] = ["breakfast", "lunch", "snack", "dinner", "latenight"];
export type Portion = "snack" | "meal" | "feast";
export type Diet = "veg" | "egg" | "anything";

/**
 * What someone is doing while they eat.
 *
 * Not a mood and not a vector axis: it constrains the *form* of the food
 * rather than its flavour. Watching something wants one hand free and no
 * mess; eating with people wants something worth sharing.
 */
export type SpiceLevel = "mild" | "medium" | "hot";
export const SPICE_LEVELS: SpiceLevel[] = ["mild", "medium", "hot"];
export const isSpiceLevel = (v: unknown): v is SpiceLevel =>
  typeof v === "string" && (SPICE_LEVELS as string[]).includes(v);

export type Activity = "watching" | "working" | "company";
export const ACTIVITIES: Activity[] = ["watching", "working", "company"];
export const isActivity = (v: unknown): v is Activity =>
  typeof v === "string" && (ACTIVITIES as string[]).includes(v);

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
  /**
   * What kind of business to look for when finding this nearby.
   *
   * Absent means "restaurant", which is right for four dishes in five and
   * stops a pickle shop or a burger joint winning a search for hummus.
   * Explicit `null` means do not constrain at all, for the fifth: a vada pav
   * stall, a mithai shop and an Irani cafe are all the correct answer to their
   * dish and none of them is a restaurant.
   */
  placeType?: string | null;
  /**
   * Permitted on a Hindu fasting day (vrat): no grain flour, no onion or
   * garlic, rock salt rather than table salt. Absent means not suitable.
   */
  fastingSafe?: boolean;
  /** Eaten with hands, no cutlery. The thing that matters when a screen is on. */
  handheld?: boolean;
  /** Drips, needs napkins, or wants both hands and your attention. */
  messy?: boolean;
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
