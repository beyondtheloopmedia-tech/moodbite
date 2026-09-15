import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { LOCAL_RADIUS_KM, findCity, haversineKm } from "@/lib/cities";
import { DISHES } from "@/lib/dishes";
import { parseInterests } from "@/lib/interests";
import {
  PLACES_KEY,
  isPlacesConfigured,
  rankPlaces,
  searchPlaces,
  type Coords,
} from "@/lib/places";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Answers } from "@/lib/types";

/**
 * Restaurants near you that are good at the dish you were just shown.
 *
 * This is the only route in the app that spends money when it runs, so it is
 * the only one that asks permission first. Three things have to be true before
 * Google is called at all: a key exists, a durable counter exists, and that
 * counter says there is budget left. Any of them missing and the answer is an
 * empty list, never an error - the delivery links on the page still work and
 * the page is still useful without this.
 */

/** metres of slack around a precise fix, versus around a whole city */
const RADIUS_NEAR_KM = 6;
const RADIUS_CITY_KM = 12;

const PATIENCE: Answers["patience"][] = ["fast", "normal", "relaxed"];

/**
 * A stable, non-reversing name for one client, used only to stop a single
 * caller eating the month's budget on their own.
 *
 * The salt is the Places key itself: it is server-only, it is stable across
 * deploys, and it is guaranteed to exist exactly when this feature is on,
 * which is three properties a separate env var would only promise.
 */
function bucketFor(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`moodbite-places-v1|${PLACES_KEY}|${ip}`).digest("hex").slice(0, 32);
}

/** Never trust a coordinate the client rounded; round it again here. */
const coarse = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: Request) {
  if (!isPlacesConfigured) {
    return NextResponse.json({ places: [], off: true });
  }

  let body: {
    dishId?: unknown;
    city?: unknown;
    coords?: unknown;
    patience?: unknown;
    mood?: unknown;
    hunger?: unknown;
    interests?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const dish = DISHES.find((d) => d.id === body.dishId);
  if (!dish) {
    return NextResponse.json({ error: "Unknown dish." }, { status: 400 });
  }

  const city = typeof body.city === "string" ? findCity(body.city) : undefined;
  if (typeof body.city === "string" && !city) {
    return NextResponse.json({ error: "We do not deliver to that city yet." }, { status: 400 });
  }

  // Where to look, and how honestly we can describe it afterwards.
  //
  // A real fix gets a tight radius drawn around the person. A city alone gets a
  // loose one drawn around the city centre, which is a different claim: the
  // centre of Hyderabad is fifteen kilometres from most of Hyderabad, so a
  // distance measured from it is not a distance from anybody. `from` travels
  // back so the panel can say which of the two it did.
  let center: Coords | null = null;
  let radiusKm = RADIUS_CITY_KM;
  let from: "you" | "city" = "city";

  const c = body.coords as { lat?: unknown; lon?: unknown } | undefined;
  if (typeof c?.lat === "number" && typeof c?.lon === "number") {
    const point = { lat: coarse(c.lat), lon: coarse(c.lon) };
    // A coordinate is only relevant to the city being asked about. Somebody in
    // Delhi looking up Mumbai wants the centre of Mumbai, and honouring their
    // position there would search the wrong end of the country.
    const stale = city && haversineKm(point.lat, point.lon, city.lat, city.lon) > LOCAL_RADIUS_KM;
    if (!stale) {
      center = point;
      radiusKm = RADIUS_NEAR_KM;
      from = "you";
    }
  }
  if (!center && city) {
    center = { lat: city.lat, lon: city.lon };
  }
  if (!center) {
    // Nothing to search around. Not an error: the page just does not show this.
    return NextResponse.json({ places: [], needsLocation: true });
  }

  // The counter is what makes this affordable, so no counter means no call.
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ places: [], off: true });
  }

  const { data: claim, error: claimError } = await supabase.rpc("claim_places_call", {
    p_bucket: bucketFor(req),
  });
  if (claimError) {
    console.warn("moodbite: could not claim a places call", claimError.message);
    return NextResponse.json({ places: [], off: true });
  }
  if (claim !== "ok") {
    return NextResponse.json({ places: [], capped: claim });
  }

  const patience = PATIENCE.includes(body.patience as Answers["patience"])
    ? (body.patience as Answers["patience"])
    : "normal";

  const raw = await searchPlaces(dish, center, radiusKm, patience);
  if (!raw) {
    return NextResponse.json({ places: [], off: true });
  }

  // Only the three answers that say anything about a restaurant are read here.
  // The rest chose the dish and have no opinion about where it comes from.
  const answers = {
    patience,
    mood: body.mood,
    hunger: body.hunger,
  } as Answers;

  const places = rankPlaces(raw, center, answers, parseInterests(body.interests), radiusKm);

  return NextResponse.json({ places, dishId: dish.id, from });
}
