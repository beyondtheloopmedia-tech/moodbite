import { getSupabaseServer } from "./supabase/server";

/**
 * What the click stream says, cached.
 *
 * Every recommendation would otherwise open with a database round trip to
 * aggregate the whole event log, which is both slow and wasteful: the answer
 * changes over hours, not between two requests a second apart.
 *
 * Cached in process memory, so each serverless instance warms independently and
 * a deploy clears it. That is a feature rather than a limitation - there is no
 * invalidation to get wrong, and the worst case is an instance working from
 * signals a few minutes stale, which for a correction this small is nothing.
 */
const TTL_MS = 10 * 60_000;

let cache: { at: number; signals: Map<string, number> } | null = null;
let inflight: Promise<Map<string, number>> | null = null;

async function load(): Promise<Map<string, number>> {
  const empty = new Map<string, number>();
  const supabase = await getSupabaseServer();
  if (!supabase) return empty;

  const { data, error } = await supabase.rpc("dish_signals");
  if (error) {
    // Never fatal. A recommendation without the learned term is the
    // recommendation this engine made for its entire life until now.
    console.warn("moodbite: could not read dish signals", error.message);
    return empty;
  }

  const out = new Map<string, number>();
  for (const row of data ?? []) {
    const lift = Number(row.lift);
    if (Number.isFinite(lift)) out.set(row.dish_id, lift);
  }
  return out;
}

export async function dishSignals(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.signals;
  // A cold instance under load would otherwise run this aggregate once per
  // concurrent request; they all wait on the same one instead.
  inflight ??= load()
    .then((signals) => {
      cache = { at: Date.now(), signals };
      return signals;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
