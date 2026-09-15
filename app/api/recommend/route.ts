import { NextResponse } from "next/server";
import { getSource, orderLinks } from "@/lib/source";
import { recommend, slotForHour, weatherBias } from "@/lib/scoring";
import { fetchWeather } from "@/lib/weather";
import { findCity } from "@/lib/cities";
import { parseInterests } from "@/lib/interests";
import { dishSignals } from "@/lib/signals";
import { dishFatigue } from "@/lib/fatigue";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  SLOTS,
  isActivity,
  isSpiceLevel,
  type Activity,
  type Answers,
  type Slot,
  type SpiceLevel,
} from "@/lib/types";

export async function POST(req: Request) {
  let body: {
    answers?: Answers;
    slot?: Slot;
    heat?: number;
    city?: string;
    interests?: unknown;
    fasting?: unknown;
    activity?: unknown;
    spice?: unknown;
    avoidCuisines?: unknown;
    exclude?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const { answers, heat } = body;
  if (!answers?.mood || !answers?.diet) {
    return NextResponse.json({ error: "Answer all six questions first." }, { status: 400 });
  }

  const slot = body.slot ?? slotForHour(new Date().getHours());
  if (!SLOTS.includes(slot)) {
    return NextResponse.json({ error: "Unknown time of day." }, { status: 400 });
  }

  // No city is a valid state (location denied, or nowhere near a listed city).
  // An unrecognised one is not: it would end up in a link and quietly send
  // someone to the wrong city's menu.
  const city = body.city ? findCity(body.city) : undefined;
  if (body.city && !city) {
    return NextResponse.json({ error: "We do not deliver to that city yet." }, { status: 400 });
  }

  // Read the weather here rather than trusting the client with it. The call is
  // the same cached one /api/weather makes, so it is usually free.
  const weather = city ? await fetchWeather(city) : null;

  // unknown ids are dropped rather than rejected: a stale preference from an
  // older build is not worth failing a request over
  const interests = parseInterests(body.interests);

  // Standing preferences. Unknown values are dropped rather than rejected: a
  // stale preference from an older build should not fail the request.
  const spice: SpiceLevel | null = isSpiceLevel(body.spice) ? body.spice : null;
  const avoidCuisines = Array.isArray(body.avoidCuisines)
    ? body.avoidCuisines.filter((c): c is string => typeof c === "string")
    : [];

  const dishes = await getSource().list(city?.slug ?? "india");
  const fasting = body.fasting === true;

  // Dishes already offered and passed over. Unknown ids cost nothing: they
  // simply match no dish, so a stale list from an older catalogue is harmless.
  const exclude = Array.isArray(body.exclude)
    ? body.exclude.filter((d): d is string => typeof d === "string").slice(0, 200)
    : [];

  // One session lookup for two things: whether they may use the Pro activity
  // feature, and what they have already been shown lately.
  const supabase = await getSupabaseServer();
  const { data: auth } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  // Activity is a Pro feature, so entitlement is checked here rather than in
  // the browser. A client-side gate is a suggestion; this is the gate.
  let activity: Activity | null = null;
  if (isActivity(body.activity) && auth?.user && supabase) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profile?.is_pro) activity = body.activity;
  }

  // Signed out there is no history to read, so the engine behaves as it always
  // has: the same answers give the same dish. Worth naming as a known gap
  // rather than a decision - it is the anonymous device id question again.
  const fatigue =
    auth?.user && supabase ? await dishFatigue(supabase, auth.user.id) : null;
  // What the click stream has learned so far. Cached, and empty is a normal
  // answer that leaves the scorer exactly as it was.
  const signals = await dishSignals();

  const ask = (skip: string[]) =>
    recommend(
      dishes,
      answers,
      slot,
      heat,
      4,
      city,
      weather,
      interests,
      fasting,
      activity,
      spice,
      avoidCuisines,
      skip,
      signals,
      fatigue,
    );

  let results = ask(exclude);

  // Asking for something else until there is nothing else should loop back to
  // the beginning, not dead-end on an empty screen. The flag travels so the
  // page can say what happened and the caller can forget what it had seen -
  // silently repeating the first four would read as the button being broken.
  let wrapped = false;
  if (results.length === 0 && exclude.length > 0) {
    results = ask([]);
    wrapped = results.length > 0;
  }

  // An empty list is a valid answer, not an error. Results renders the copy.
  return NextResponse.json({
    slot,
    city: city ?? null,
    weatherNote: weatherBias(weather).note || null,
    fasting,
    activity,
    wrapped,
    results: results.map((r) => ({ ...r, links: orderLinks(r.dish, city) })),
  });
}
