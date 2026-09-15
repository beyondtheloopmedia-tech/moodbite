import { DISHES } from "./dishes";
import type { City, Dish } from "./types";

/**
 * The seam between the mood engine and wherever dishes actually come from.
 *
 * Today: a static seed file.
 * Later: a partner feed, a per-city curated sheet, or your own ingestion job.
 * Implement this interface and nothing else in the app has to change.
 */
export interface DishSource {
  name: string;
  list(city: string): Promise<Dish[]>;
}

export const seedSource: DishSource = {
  name: "seed",
  async list() {
    return DISHES;
  },
};

let active: DishSource = seedSource;
export const setSource = (s: DishSource) => {
  active = s;
};
export const getSource = () => active;

/**
 * Hand off to the delivery apps, so no scraping is involved.
 *
 * Zomato ignores `?q=` on a cold page load. It writes that parameter when you
 * search inside the app and reads it back from client state, so a link built
 * with it lands on the city's generic delivery page every time. The thing that
 * does survive a fresh load is the dish path, /<city>/delivery/dish-<slug>,
 * which is server rendered. Those slugs exist only for dishes Zomato has a page
 * for and 404 otherwise, so they are verified per dish rather than generated,
 * and a dish without one falls back to its city's delivery page.
 *
 * With no city we link to Zomato's front door, never /india/delivery: that path
 * silently serves Hyderabad, which is wrong for everyone who is not in it.
 *
 * Swiggy has no city or dish in its URL; it resolves both from the user's own
 * session and saved address, so its link is the same everywhere.
 *
 * Google Maps uses the documented /maps/search/?api=1 form, which takes a plain
 * query and needs no key. That matters twice over: it is the only one of the
 * three that answers "where can I go and eat this" rather than "who will bring
 * it", and unlike the restaurant panel it costs nothing and never runs out. The
 * panel is capped at a few dozen lookups a day; this link is what is still
 * standing when that cap is reached.
 */
export function orderLinks(dish: Dish, city?: City) {
  const q = encodeURIComponent(dish.searchTerm);

  let zomato: string;
  if (city && dish.zomatoDish) {
    zomato = `https://www.zomato.com/${city.slug}/delivery/dish-${dish.zomatoDish}`;
  } else if (city) {
    zomato = `https://www.zomato.com/${city.slug}/delivery`;
  } else {
    zomato = "https://www.zomato.com/";
  }

  // The city name rather than the slug: this is read by a search engine, not
  // matched against a path, and "Delhi NCR" finds more than "ncr" does.
  const mapsQuery = encodeURIComponent(
    city ? `${dish.searchTerm} ${city.name}` : dish.searchTerm,
  );

  return {
    swiggy: `https://www.swiggy.com/search?query=${q}`,
    zomato,
    maps: `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`,
  };
}
