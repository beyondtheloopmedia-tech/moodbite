"use client";

import type { Weather } from "@/lib/weather";

/**
 * Clock, greeting, weather. One quiet line above everything, present on every
 * step so the time is always in view while you answer.
 */
export default function AmbienceBar({
  now,
  greeting,
  weather,
  weatherLine,
}: {
  now: Date | null;
  greeting: string;
  weather: Weather | null;
  weatherLine: string | null;
}) {
  // nothing until the clock is real; see useAmbience
  if (!now) return <div className="h-5" aria-hidden />;

  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex h-5 flex-wrap items-baseline gap-x-2.5 text-sm text-ink-soft">
      <time
        dateTime={now.toISOString()}
        className="font-display tabular-nums text-ink"
        aria-label={`The time is ${time}`}
      >
        {time}
      </time>
      <span aria-hidden>·</span>
      <span>{greeting}</span>
      {weatherLine && weather ? (
        <>
          <span aria-hidden>·</span>
          <span>{weatherLine}</span>
        </>
      ) : null}
    </div>
  );
}
