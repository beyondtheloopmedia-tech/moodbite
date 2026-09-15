import { NextResponse } from "next/server";
import { getSource, orderLinks } from "@/lib/source";
import { recommend, slotForHour, weatherBias } from "@/lib/scoring";
import { fetchWeather } from "@/lib/weather";
import { findCity } from "@/lib/cities";
import { parseInterests } from "@/lib/interests";
import { SLOTS, type Answers, type Slot } from "@/lib/types";

export async function POST(req: Request) {
  let body: {
    answers?: Answers;
    slot?: Slot;
    heat?: number;
    city?: string;
    interests?: unknown;
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

  const dishes = await getSource().list(city?.slug ?? "india");
  const results = recommend(dishes, answers, slot, heat, 4, city, weather, interests);

  // An empty list is a valid answer, not an error. Results renders the copy.
  return NextResponse.json({
    slot,
    city: city ?? null,
    weatherNote: weatherBias(weather).note || null,
    results: results.map((r) => ({ ...r, links: orderLinks(r.dish, city) })),
  });
}
