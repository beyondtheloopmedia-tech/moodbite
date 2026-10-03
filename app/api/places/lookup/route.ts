import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { findCity } from "@/lib/cities";
import { PLACES_KEY, isPlacesConfigured, lookupPlace } from "@/lib/places";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Find a restaurant's Google place id, for an admin attaching one to a listing.
 *
 * Admin-only, which is not decoration: this spends from the same monthly budget
 * the public nearby panel draws on, so letting anyone call it would let anyone
 * drain it. The check is the database's, not this file's - is_admin() is read
 * through the caller's own session.
 *
 * Only the id is ever meant to leave here and be kept. The names and addresses
 * exist so a human can tell the Banjara Hills branch from the Jubilee Hills one,
 * and the client saves the id alone; Google permit storing that and forbid
 * storing the rest.
 */
function bucketFor(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256")
    .update(`moodbite-places-v1|${PLACES_KEY}|${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export async function POST(req: Request) {
  if (!isPlacesConfigured) {
    return NextResponse.json({ candidates: [], off: true });
  }

  const supabase = await getSupabaseServer();
  if (!supabase) return NextResponse.json({ candidates: [], off: true });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let body: { name?: unknown; city?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const city = typeof body.city === "string" ? findCity(body.city) : undefined;
  if (!name) return NextResponse.json({ error: "A name to search for." }, { status: 400 });
  if (!city) return NextResponse.json({ error: "Pick a city first." }, { status: 400 });

  // Same budget, same limiter. A lookup is a cheaper SKU than a dish search but
  // it is not free, and a counter that only some callers respect is not one.
  const { data: claim, error: claimError } = await supabase.rpc("claim_places_call", {
    p_bucket: bucketFor(req),
  });
  if (claimError) {
    console.warn("moodbite: could not claim a lookup", claimError.message);
    return NextResponse.json({ candidates: [], off: true });
  }
  if (claim !== "ok") {
    return NextResponse.json({ candidates: [], capped: claim });
  }

  const candidates = await lookupPlace(`${name} ${city.name}`, { lat: city.lat, lon: city.lon });
  if (!candidates) return NextResponse.json({ candidates: [], off: true });

  return NextResponse.json({ candidates });
}
