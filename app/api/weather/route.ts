import { NextResponse } from "next/server";
import { findCity } from "@/lib/cities";
import { fetchWeather, weatherLine } from "@/lib/weather";

/**
 * Weather for a known city, by slug.
 *
 * The browser sends a city name and nothing else. Resolving that to coordinates
 * happens here against our own table, so the device's position never reaches a
 * third party.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("city");
  const city = slug ? findCity(slug) : undefined;
  if (!city) {
    return NextResponse.json({ error: "Unknown city." }, { status: 400 });
  }

  const weather = await fetchWeather(city);
  if (!weather) {
    // Upstream is down or slow. Not an error worth showing anyone.
    return NextResponse.json({ weather: null }, { status: 200 });
  }

  return NextResponse.json({ weather, line: weatherLine(weather) });
}
