import type { Diet, Dish } from "./types";

/**
 * Cooking is a different question from ordering.
 *
 * The six mood questions ask how somebody feels, because the craving is
 * downstream of the mood. Somebody standing in their own kitchen has already
 * decided to cook; what they need settled is what they are cooking FOR - the
 * hour they have, who is eating, and what they want out of it. Those are
 * constraints and intentions rather than feelings, so this is a separate model
 * rather than a flag on the existing one.
 */

/**
 * How long a dish takes to actually make, in three bands rather than minutes.
 *
 * Bands, because minutes would be false precision: nobody has measured these
 * and a stated "32 minutes" would be a fabrication dressed as data. Three
 * buckets are a judgement the catalogue can honestly carry.
 *
 * Derived from portion and delivery ETA, which is a PROXY and said to be one.
 * A kitchen's 50-minute biryani really is slower to make than its 20-minute
 * poha, so the correlation is real - but it is a correlation, and it breaks in
 * both directions. A restaurant pizza arrives fast and is an evening's work at
 * home; momos arrive fast and are fiddly for an hour. Those cases are listed
 * below by hand, which is the honest way to hold a proxy: use it where it
 * holds, override it where it does not, and say which is which.
 */
export type CookBand = "quick" | "medium" | "project";

/** Where the proxy is plainly wrong, judged dish by dish. */
const COOK_OVERRIDE: Record<string, CookBand> = {
  // Fast to deliver, an evening's work at home: dough, proving, a hot oven.
  "family-pizza": "project",
  margherita: "project",
  // Folded one at a time. Quick to arrive, never quick to make.
  "veg-momos": "project",
  momos: "project",
  // Layered and slow-cooked whatever the delivery estimate says.
  "hyd-biryani": "project",
  "veg-biryani": "project",
  haleem: "project",
  "gongura-mutton": "project",
  // Fermented batter is a two-day job unless it is bought.
  "masala-dosa": "project",
  "idli-sambar": "project",
  pesarattu: "medium",
  // Deep frying at home is slower and messier than its ETA suggests.
  "chole-bhature": "project",
  "samosa-chai": "project",
  "samosa-chaat-platter": "medium",
  // Genuinely fast at home whatever the restaurant quotes.
  "curd-rice": "quick",
  poha: "quick",
  "fruit-dahi": "quick",
  "egg-bhurji-pav": "quick",
  "filter-coffee": "quick",
  "irani-chai-osmania": "quick",
};

export function cookBand(dish: Dish): CookBand {
  const override = COOK_OVERRIDE[dish.id];
  if (override) return override;
  if (dish.portion === "feast" || dish.eta >= 45) return "project";
  if (dish.portion === "snack" && dish.eta <= 25) return "quick";
  return "medium";
}

export const COOK_BAND_LABEL: Record<CookBand, string> = {
  quick: "Under half an hour",
  medium: "An hour-ish",
  project: "Give it an afternoon",
};

/**
 * What somebody is cooking for.
 *
 * Each one has to be answerable from data the catalogue genuinely holds. No
 * goal is listed here that would need a number nobody has measured - there is
 * no "high protein" option, because the dishes carry no nutrition data and
 * inventing some to fill a dropdown would be worse than leaving the question
 * unasked.
 */
export const COOK_GOALS = [
  {
    id: "light",
    label: "Something that sits light",
    blurb: "Nothing that needs a lie-down after.",
  },
  {
    id: "cheap",
    label: "Keep it cheap",
    blurb: "Store cupboard, not a shopping trip.",
  },
  {
    id: "impress",
    label: "Feed people properly",
    blurb: "Somebody is coming over and you want it to land.",
  },
  {
    id: "comfort",
    label: "Something comforting",
    blurb: "The one you already know by heart.",
  },
  {
    id: "learn",
    label: "Cook something new",
    blurb: "You have the time and want to come out knowing a dish.",
  },
] as const;

export type CookGoalId = (typeof COOK_GOALS)[number]["id"];
export const COOK_GOAL_IDS = COOK_GOALS.map((g) => g.id);
export const isCookGoal = (v: unknown): v is CookGoalId =>
  typeof v === "string" && (COOK_GOAL_IDS as readonly string[]).includes(v);

/**
 * Where to actually find the method.
 *
 * Link out rather than reproduce. A recipe's ingredient list is a list of
 * facts and carries no copyright, but the written method, the headnote and the
 * photographs are somebody's work - copying those onto this site would be
 * infringement whether or not it was credited. There is also no API that
 * serves "the best recipe on the web"; scraping search results is against the
 * terms of every engine that has them.
 *
 * So this hands the reader to a search, the same way the dish results hand them
 * to Swiggy. YouTube leads because Indian home cooking is taught far better in
 * video than in prose, and because a stranger's hands in a real kitchen settles
 * questions that no amount of written method does.
 */
export function recipeLinks(dish: Dish) {
  const q = encodeURIComponent(`${dish.searchTerm} recipe`);
  return {
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    web: `https://www.google.com/search?q=${q}`,
  };
}

/**
 * Pick what to cook.
 *
 * Deliberately simpler than the mood engine and deliberately not sharing its
 * code. That one navigates a six-axis feeling toward a dish; this one applies
 * constraints somebody has stated outright. Reusing the vector machinery here
 * would dress a filter up as a model.
 *
 * Time is a hard filter rather than a preference, for the same reason diet is:
 * somebody with twenty minutes does not want to be sold a biryani, however
 * well it would otherwise score.
 */
export function whatToCook(
  dishes: Dish[],
  opts: {
    time: CookBand;
    goals: CookGoalId[];
    diet: Diet;
    exclude?: string[];
  },
  limit = 4,
): { dish: Dish; why: string[] }[] {
  const { time, goals, diet, exclude = [] } = opts;
  const allowed: CookBand[] =
    time === "project" ? ["quick", "medium", "project"] : time === "medium" ? ["quick", "medium"] : ["quick"];

  const scored = dishes
    .filter((d) => !exclude.includes(d.id))
    .filter((d) => (diet === "veg" ? d.veg : diet === "egg" ? d.veg || d.containsEgg : true))
    // Nothing that exists only to be ordered: a fasting dish is a rule about a
    // day, not a thing somebody sets out to learn.
    .filter((d) => d.fastingSafe !== true)
    .filter((d) => allowed.includes(cookBand(d)))
    .map((dish) => {
      let score = 0;
      const why: string[] = [];
      const v = dish.vector;

      if (goals.includes("light")) {
        score += v.lightness * 1.2 - v.indulgence * 0.6;
        if (v.lightness >= 0.7) why.push("sits light");
      }
      if (goals.includes("cheap")) {
        score += (3 - dish.priceBand) * 0.45;
        if (dish.priceBand === 1) why.push("costs almost nothing to make");
      }
      if (goals.includes("impress")) {
        score += (dish.portion === "feast" ? 0.9 : 0) + v.indulgence * 0.5 + v.novelty * 0.4;
        if (dish.portion === "feast") why.push("feeds a table");
      }
      if (goals.includes("comfort")) {
        score += v.comfort * 1.1 - v.novelty * 0.4;
        if (v.comfort >= 0.75) why.push("the one you already know");
      }
      if (goals.includes("learn")) {
        score += v.novelty * 1.0 + (cookBand(dish) === "project" ? 0.5 : 0);
        if (cookBand(dish) === "project") why.push("worth the afternoon");
      }
      // With nothing selected, lead with what is genuinely achievable rather
      // than with whatever happens to sort first.
      if (goals.length === 0) score += (cookBand(dish) === "quick" ? 0.6 : 0) + v.comfort * 0.4;

      return { dish, score, why };
    })
    .sort((a, b) => b.score - a.score);

  // Two per cuisine, same reasoning as the dish shortlist: four variations on
  // one kitchen is not a choice.
  const picked: { dish: Dish; why: string[] }[] = [];
  const seen: Record<string, number> = {};
  for (const r of scored) {
    const n = seen[r.dish.cuisine] ?? 0;
    if (n >= 2) continue;
    seen[r.dish.cuisine] = n + 1;
    picked.push({ dish: r.dish, why: r.why });
    if (picked.length === limit) break;
  }
  return picked;
}
