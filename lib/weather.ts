import type { City } from "./types";

export type Condition = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "storm" | "snow";

export interface Weather {
  tempC: number;
  feelsLikeC: number;
  condition: Condition;
  isDay: boolean;
}

/**
 * WMO weather codes, collapsed to the handful of conditions that change what
 * you feel like eating. The full table has 28 codes and splits hairs the page
 * cannot use ("light freezing drizzle" reads as rain to a hungry person).
 */
function conditionFor(code: number): Condition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95) return "storm";
  return "rain"; // 61-67 rain, 80-82 showers
}

/**
 * How the page says it out loud. Kept short: this sits under a greeting, it is
 * not a forecast.
 */
export function weatherLine(w: Weather): string {
  const t = Math.round(w.tempC);
  const hot = w.tempC >= 33;
  const cold = w.tempC <= 16;
  switch (w.condition) {
    case "storm":
      return `${t}°, and it is thundering.`;
    case "rain":
      return `${t}° and raining.`;
    case "drizzle":
      return `${t}°, drizzling on and off.`;
    case "snow":
      return `${t}° and snowing.`;
    case "fog":
      return `${t}° and fogged in.`;
    case "cloudy":
      return hot ? `${t}°, grey and sticky.` : `${t}° and overcast.`;
    default:
      if (hot) return `${t}° and blazing.`;
      if (cold) return `${t}°, properly cold.`;
      return w.isDay ? `${t}° and clear.` : `${t}°, clear night.`;
  }
}

/**
 * Open-Meteo: no key, no account, CORS-open. Called from the server so that the
 * only coordinate it ever sees is a city centre from our own table, never the
 * device's actual position.
 *
 * Free for non-commercial use; a commercial Moodbite needs their paid plan.
 */
export async function fetchWeather(city: City): Promise<Weather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,is_day`;

  try {
    // Open-Meteo advances "current" every 15 minutes, so asking more often than
    // that just spends someone's rate limit to get the same numbers back.
    const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.current;
    if (!c || typeof c.temperature_2m !== "number") return null;
    return {
      tempC: c.temperature_2m,
      feelsLikeC: typeof c.apparent_temperature === "number" ? c.apparent_temperature : c.temperature_2m,
      condition: conditionFor(Number(c.weather_code)),
      isDay: c.is_day === 1,
    };
  } catch {
    // Weather is decoration. If it is down, the app is not.
    return null;
  }
}
