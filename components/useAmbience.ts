"use client";

import { useEffect, useState } from "react";
import { dayPartForHour, greetingFor, type DayPart } from "@/lib/daypart";
import type { Weather } from "@/lib/weather";
import type { City } from "@/lib/types";

/**
 * The clock and the sky, and the two data attributes the stylesheet reads.
 *
 * `now` stays null until mount on purpose: the server's clock is not the
 * reader's, so rendering a time during SSR would be a hydration mismatch and,
 * worse, briefly the wrong time.
 */
export function useAmbience(city: City | null) {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // often enough that the minute is never visibly stale, cheap enough to
    // leave running: a day part boundary crossing re-themes the page
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const dayPart: DayPart | null = now ? dayPartForHour(now.getHours()) : null;

  useEffect(() => {
    if (!city) {
      setWeather(null);
      setLine(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city.slug)}`);
        if (!res.ok) throw new Error("no weather");
        const data = await res.json();
        if (cancelled) return;
        setWeather(data.weather ?? null);
        setLine(data.line ?? null);
      } catch {
        if (!cancelled) {
          setWeather(null);
          setLine(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [city?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // the stylesheet does the rest
  useEffect(() => {
    const el = document.documentElement;
    if (dayPart) el.dataset.daypart = dayPart;
    if (weather) el.dataset.weather = weather.condition;
    else delete el.dataset.weather;
  }, [dayPart, weather]);

  return {
    now,
    dayPart,
    greeting: dayPart ? greetingFor(dayPart) : "",
    weather,
    weatherLine: line,
  };
}
