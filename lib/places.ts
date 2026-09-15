import { haversineKm } from "./cities";
import type { InterestId } from "./interests";
import type { Answers, Dish } from "./types";

/**
 * Real restaurants for a dish the engine already chose.
 *
 * Moodbite answers "what should I eat". Google answers "where". Those are
 * different questions and this file is the seam between them: it never picks a
 * dish, it only takes one that has already been picked and finds places near
 * you that are good at it.
 *
 * Absent a key this whole feature is off and the app behaves exactly as it did
 * before, which is the same contract `lib/supabase/config.ts` uses.
 */
export const PLACES_KEY = process.env.GOOGLE_PLACES_KEY ?? "";
export const isPlacesConfigured = Boolean(PLACES_KEY);

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

/**
 * The billed SKU is decided by the highest tier field in this mask, and
 * rating, userRatingCount, priceLevel and opening hours are all Enterprise.
 * That is 1,000 free calls a month and $35 per 1,000 after, so the mask is the
 * single most expensive line in this file. Two fields were deliberately left
 * out:
 *
 *   delivery / takeout / dineIn   would promote this to Enterprise+Atmosphere
 *                                 ($40) to answer a question proximity and
 *                                 rankPreference already answer well enough.
 *   servesVegetarianFood          same tier jump, and it is frequently unset
 *                                 on Indian listings, so it would quietly
 *                                 discard good results. The dish is already
 *                                 diet-filtered upstream, so searching for it
 *                                 by name does the work instead.
 *
 * Do not add a field here without checking which tier it sits in.
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.currentOpeningHours.openNow",
].join(",");

export interface Place {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  rating: number | null;
  reviews: number;
  /** 1 cheap to 4 very expensive; null when Google has no price for it */
  priceLevel: number | null;
  /** null means Google has no hours, which is common for small places here */
  openNow: boolean | null;
  mapsUri: string | null;
  km: number;
  /** the rating after review count has been made to earn it; what we rank on */
  adjusted: number;
}

export interface Coords {
  lat: number;
  lon: number;
}

/**
 * A 4.8 from eleven reviews is not better than a 4.3 from eight hundred, and a
 * raw sort by rating puts the eleven first every time. So each rating is pulled
 * toward the mean by a prior worth PRIOR_REVIEWS reviews: a place needs volume
 * before its average is allowed to speak at full volume.
 *
 * PRIOR_RATING is set near the Indian restaurant mean rather than the midpoint
 * of the scale, because 2.5 is not what an average restaurant scores here.
 */
const PRIOR_REVIEWS = 50;
const PRIOR_RATING = 4.0;

export function shrinkRating(rating: number | null, reviews: number): number {
  if (rating === null || reviews <= 0) return PRIOR_RATING;
  const w = reviews / (reviews + PRIOR_REVIEWS);
  return w * rating + (1 - w) * PRIOR_RATING;
}

/**
 * How the three things a place can be good at trade off against each other.
 *
 * Patience is the lever because it is the one answer that is already about
 * distance in disguise: somebody who will not wait half an hour for delivery
 * will not drive across town either.
 */
/**
 * How much Google's own ordering counts.
 *
 * The other three weights answer "is this place any good, near, affordable".
 * None of them answers "does it actually serve the dish", and that is the one
 * question a text search is already good at. Discarding its order entirely is
 * what let a burger place win a search for hummus: Google had it eighth and
 * put a dedicated hummus restaurant first, and our score overturned that on a
 * margin of 0.010 because 4.9 from 613 reviews shrinks higher than 4.6 from
 * 938.
 *
 * Deliberately not larger. At roughly 15% of the total it can settle a close
 * call and cannot overturn a clear one - relevance strong enough to dominate
 * would just reproduce Google's list and throw away the mood ranking, which is
 * the entire point of doing this ourselves. It does not vary by patience:
 * whether a place serves the dish has nothing to do with how long you will
 * wait for it.
 */
const RELEVANCE_WEIGHT = 0.18;

const WEIGHTS: Record<Answers["patience"], { quality: number; near: number; price: number }> = {
  fast: { quality: 0.35, near: 0.5, price: 0.15 },
  normal: { quality: 0.5, near: 0.33, price: 0.17 },
  relaxed: { quality: 0.65, near: 0.18, price: 0.17 },
};

/**
 * The price band to aim at, on Google's 1-4 scale.
 *
 * "Watching the spend" is a standing preference and wins, because it is a
 * statement about money rather than about tonight. Otherwise a big night out
 * is allowed to cost more, and everything else sits in the middle.
 */
function desiredPrice(answers: Answers, interests: InterestId[]): number {
  if (interests.includes("thrifty")) return 1;
  if (answers.mood === "celebrating" && answers.hunger === "feast") return 3;
  if (answers.mood === "celebrating" || answers.hunger === "feast") return 2.5;
  return 2;
}

const PRICE_LEVEL: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean };
}

/**
 * Rank by the same mood that picked the dish.
 *
 * This is the part that makes the integration more than a nearby-search widget
 * bolted to the side: the answers that chose *what* to eat also choose *where*,
 * so a tired person on a Tuesday and a celebrating person on a Saturday looking
 * at the identical dish get a different first suggestion.
 */
export function rankPlaces(
  raw: RawPlace[],
  center: Coords,
  answers: Answers,
  interests: InterestId[],
  radiusKm: number,
  limit = 5,
): Place[] {
  const w = WEIGHTS[answers.patience] ?? WEIGHTS.normal;
  const want = desiredPrice(answers, interests);
  const priceWeight = interests.includes("thrifty") ? w.price * 1.8 : w.price;

  // Google's position is captured before filtering, so dropping a closed
  // restaurant does not promote everything below it up the relevance scale.
  const span = Math.max(1, raw.length - 1);

  return raw
    .map((p, rank) => ({ p, rank }))
    .filter(
      (e): e is { p: RawPlace & { id: string; location: { latitude: number; longitude: number } }; rank: number } =>
        typeof e.p.id === "string" &&
        typeof e.p.location?.latitude === "number" &&
        typeof e.p.location?.longitude === "number" &&
        // Permanently closed places still come back in results. A shut
        // restaurant is never the answer to "where can I get this".
        e.p.businessStatus === "OPERATIONAL",
    )
    .map(({ p, rank }) => {
      const lat = p.location.latitude;
      const lon = p.location.longitude;
      const km = haversineKm(center.lat, center.lon, lat, lon);
      const reviews = p.userRatingCount ?? 0;
      const rating = typeof p.rating === "number" ? p.rating : null;
      const adjusted = shrinkRating(rating, reviews);
      const priceLevel = p.priceLevel ? (PRICE_LEVEL[p.priceLevel] ?? null) : null;
      const openNow = p.currentOpeningHours?.openNow ?? null;

      // 3.0 to 5.0 is the band real restaurants actually occupy once shrunk,
      // so normalising across it spreads them out instead of bunching them.
      const quality = clamp01((adjusted - 3) / 2);
      const near = clamp01(1 - km / radiusKm);
      // An unknown price is not a bad price, so it lands mid-scale rather than
      // being punished into last place.
      const priceFit = priceLevel === null ? 0.55 : clamp01(1 - Math.abs(priceLevel - want) * 0.3);

      // 1 for whatever Google put first, 0 for whatever it put last.
      const relevance = 1 - rank / span;

      let score =
        quality * w.quality +
        near * w.near +
        priceFit * priceWeight +
        relevance * RELEVANCE_WEIGHT;
      // Open beats shut by enough to matter but not enough to put a bad place
      // above a good one. Unknown hours sit in between, uncounted either way.
      if (openNow === true) score += 0.12;
      else if (openNow === false) score -= 0.25;

      return {
        id: p.id,
        name: p.displayName?.text ?? "Unnamed",
        address: p.formattedAddress ?? "",
        lat,
        lon,
        rating,
        reviews,
        priceLevel,
        openNow,
        mapsUri: p.googleMapsUri ?? null,
        km: Math.round(km * 10) / 10,
        adjusted: Math.round(adjusted * 10) / 10,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...place }) => place);
}

/**
 * One Text Search call. The caller has already decided it is allowed to spend
 * this, so nothing here consults a quota; see app/api/places/route.ts.
 *
 * `includedType` comes from the dish rather than being fixed or absent.
 * Unconstrained, a text search for "hummus falafel pita" returned a burger
 * joint first and a search for gongura returned a pickle shop - Google matches
 * the words wherever they appear, including in reviews. Pinned to "restaurant"
 * for everything, it would instead lose the vada pav stall, the mithai shop
 * and the Irani cafe, which are the correct answers to their dishes and none
 * of which is a restaurant. So it defaults to "restaurant" and the twenty per
 * cent that are not restaurant food opt out by name in dishes.ts.
 *
 * Those ten opt out to *nothing* rather than to "cafe" or "bakery". Picking a
 * specific type for them would be a guess, and a wrong guess returns an empty
 * list, which is worse than the occasional miscategorised result it would be
 * fixing. Verifying a guess costs a billed call per dish per attempt.
 */
export async function searchPlaces(
  dish: Dish,
  center: Coords,
  radiusKm: number,
  patience: Answers["patience"],
  signal?: AbortSignal,
): Promise<RawPlace[] | null> {
  if (!isPlacesConfigured) return null;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: dish.searchTerm,
      // undefined is absent from the JSON entirely, which is what an
      // unconstrained search needs; `null` would be rejected as a bad type.
      includedType: dish.placeType === null ? undefined : (dish.placeType ?? "restaurant"),
      pageSize: 15,
      regionCode: "IN",
      languageCode: "en",
      // Somebody who will not wait wants the closest acceptable thing; anyone
      // else is better served by Google's own relevance, which we then re-rank.
      rankPreference: patience === "fast" ? "DISTANCE" : "RELEVANCE",
      locationBias: {
        circle: {
          center: { latitude: center.lat, longitude: center.lon },
          // metres, and Google rejects anything above 50km
          radius: Math.min(50_000, radiusKm * 1000),
        },
      },
    }),
    // Google's own content must not be stored, so there is nothing to cache.
    cache: "no-store",
  });

  if (!res.ok) {
    console.warn("moodbite: places search failed", res.status, await res.text().catch(() => ""));
    return null;
  }

  const data = (await res.json()) as { places?: RawPlace[] };
  return data.places ?? [];
}
