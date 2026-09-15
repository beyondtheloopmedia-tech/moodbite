"use client";

/**
 * An opaque name for this browser, and a memory of what it has been shown.
 *
 * Neither leaves the device except to our own server, and neither is an
 * identity: the id is a random value with nothing behind it, and the history is
 * a list of dish ids with timestamps. No coordinate, no address, nothing about
 * a person.
 *
 * The split matters. The ID is sent with events so the aggregate signal can
 * count a session's picks without an account. The HISTORY is sent with a
 * recommendation request so the engine can avoid repeating itself, and is
 * deliberately never stored server-side - storing it would turn the id into a
 * bearer token that reads back somebody's week.
 */

const ID_KEY = "moodbite.device";
const HISTORY_KEY = "moodbite.seen";

/** Long enough to outlast the fatigue window with room to spare. */
const KEEP_DAYS = 21;
/** A hard cap, so a heavy user's payload cannot grow without bound. */
const KEEP_MAX = 240;

export interface Sighting {
  /** dish id */
  d: string;
  /** epoch millis, shortened because this travels in every request */
  t: number;
  /** clicked rather than merely shown */
  c?: 1;
}

export function deviceId(): string | null {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    // Private mode, or storage blocked. Anonymous logging simply does not
    // happen, which is a supported state rather than a failure.
    return null;
  }
}

export function readHistory(): Sighting[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - KEEP_DAYS * 864e5;
    return parsed.filter(
      (x): x is Sighting =>
        typeof x === "object" && x !== null &&
        typeof (x as Sighting).d === "string" &&
        typeof (x as Sighting).t === "number" &&
        (x as Sighting).t > cutoff,
    );
  } catch {
    return [];
  }
}

export function remember(entries: Sighting[]) {
  if (entries.length === 0) return;
  try {
    // Newest first, trimmed by age in readHistory and by count here.
    const next = [...entries, ...readHistory()].slice(0, KEEP_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Nothing to do and nothing worth telling anybody.
  }
}
