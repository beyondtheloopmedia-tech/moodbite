/**
 * How the page talks about the hour, which is finer grained than how the engine
 * reasons about it. `Slot` decides what food is plausible and there are five of
 * those; this decides what the page says and how it looks, and there are eight.
 * Keeping them apart means new copy never moves a meal boundary by accident.
 */
export type DayPart =
  | "lateNight"
  | "earlyMorning"
  | "morning"
  | "brunch"
  | "lunch"
  | "afternoon"
  | "evening"
  | "dinner";

/**
 * Ordered by hour. Each entry owns the hours from `from` up to the next `from`,
 * and the last wraps around to the first. This array is the only place the
 * boundaries exist: the no-flash script in the layout is generated from it.
 */
export const DAY_PARTS: { id: DayPart; from: number; greeting: string }[] = [
  { id: "lateNight", from: 0, greeting: "Still up." },
  { id: "earlyMorning", from: 5, greeting: "Early start." },
  { id: "morning", from: 8, greeting: "Good morning." },
  { id: "brunch", from: 11, greeting: "Brunch, if we are being honest." },
  { id: "lunch", from: 12, greeting: "Lunch time." },
  { id: "afternoon", from: 15, greeting: "The afternoon dip." },
  { id: "evening", from: 18, greeting: "Good evening." },
  { id: "dinner", from: 20, greeting: "Dinner time." },
];

export function dayPartForHour(hour: number): DayPart {
  let current = DAY_PARTS[0].id;
  for (const p of DAY_PARTS) {
    if (hour >= p.from) current = p.id;
  }
  return current;
}

export const greetingFor = (part: DayPart) =>
  DAY_PARTS.find((p) => p.id === part)?.greeting ?? "";

/** Hour boundaries as [hour, id] pairs, for the inline script in the layout. */
export const DAY_PART_BOUNDARIES: [number, DayPart][] = DAY_PARTS.map((p) => [p.from, p.id]);
