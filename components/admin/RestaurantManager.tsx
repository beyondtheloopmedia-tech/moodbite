"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { CITIES } from "@/lib/cities";
import { slugify } from "@/lib/posts";

export interface RestaurantRow {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  city: string;
  lat: number | null;
  lon: number | null;
  cuisines: string[];
  price_band: number | null;
  veg_only: boolean;
  listed: boolean;
}

const BLANK = {
  id: "",
  name: "",
  slug: "",
  area: "",
  city: CITIES[0].slug,
  lat: "",
  lon: "",
  cuisines: "",
  price_band: "",
  veg_only: false,
  listed: true,
};

/**
 * Listings are curated, the way Glassdoor curates employers.
 *
 * Letting anyone add a restaurant is how a review site fills with duplicates,
 * closed businesses and places that never existed - and on a site whose whole
 * claim is that its reviews are about real visits, a listing nobody checked
 * undermines the reviews attached to it.
 *
 * The coordinates are what make "was there" possible, so a listing without
 * them can still be reviewed but no review of it can ever be marked as
 * written at the restaurant. The form says so rather than letting that be a
 * surprise later.
 */
export default function RestaurantManager({ initial }: { initial: RestaurantRow[] }) {
  const supabase = getSupabaseBrowser();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const locked = Boolean(draft?.id);

  /**
   * Fill the coordinates from where this device is right now.
   *
   * The real use is adding a place while standing in it, which is also the
   * only way to get a coordinate that is certainly ours rather than lifted
   * from a mapping provider whose terms forbid us keeping it.
   */
  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setProblem("This browser will not share a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setDraft((d) =>
          d
            ? {
                ...d,
                lat: pos.coords.latitude.toFixed(6),
                lon: pos.coords.longitude.toFixed(6),
              }
            : d,
        );
      },
      () => {
        setLocating(false);
        setProblem("Could not read this device's location.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function save() {
    if (!supabase || !draft) return;
    const name = draft.name.trim();
    const slug = (draft.slug || slugify(name)).trim();
    if (!name || !slug) {
      setProblem("A listing needs a name.");
      return;
    }
    const lat = draft.lat.trim() ? Number(draft.lat) : null;
    const lon = draft.lon.trim() ? Number(draft.lon) : null;
    if ((lat !== null && Number.isNaN(lat)) || (lon !== null && Number.isNaN(lon))) {
      setProblem("Coordinates have to be numbers, or empty.");
      return;
    }

    setSaving(true);
    setProblem(null);
    const fields = {
      slug,
      name,
      area: draft.area.trim() || null,
      city: draft.city,
      lat,
      lon,
      cuisines: draft.cuisines
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      price_band: draft.price_band ? Number(draft.price_band) : null,
      veg_only: draft.veg_only,
      listed: draft.listed,
    };

    // try/finally, because without it a thrown error - a dropped connection,
    // anything the client raises rather than returns - skips every line below
    // and leaves the button disabled reading "Saving" with nothing said. A
    // save that fails silently is worse than one that fails loudly.
    let data: unknown = null;
    let error: { message: string; code?: string; details?: string } | null = null;
    try {
      const res = draft.id
        ? await supabase.from("restaurants").update(fields).eq("id", draft.id).select().single()
        : await supabase.from("restaurants").insert(fields).select().single();
      data = res.data;
      error = res.error;
    } catch (e) {
      error = { message: e instanceof Error ? e.message : "The request did not complete." };
    } finally {
      setSaving(false);
    }

    if (error) {
      console.error("moodbite: saving a listing failed", error);
      setProblem(
        error.code === "23505"
          ? "Another listing already uses that address."
          : `${error.message}${error.code ? ` (${error.code})` : ""}`,
      );
      return;
    }
    const row = data as RestaurantRow;
    setRows((prev) => [row, ...prev.filter((x) => x.id !== row.id)].sort((a, b) =>
      a.name.localeCompare(b.name),
    ));
    setNotice(
      `Saved. ${row.lat === null || row.lon === null ? 'No coordinates, so no review of this can ever be marked "was there".' : "Reviews written at the door can be marked as such."}`,
    );
    setDraft(null);
  }

  /**
   * What this browser tab actually is, as far as the database is concerned.
   *
   * The admin page renders from the server session; every write on it goes
   * through a separate client that reads the session from cookies. Those two
   * can disagree - a page that renders for an admin while writes go out as
   * anon looks exactly like a save that does nothing - and nothing on screen
   * has been able to tell them apart.
   */
  async function checkAccess() {
    if (!supabase) return;
    setProblem(null);
    setNotice("Checking…");

    const { data: auth } = await supabase.auth.getUser();
    const who = auth.user ? `signed in as ${auth.user.email ?? auth.user.id}` : "NOT SIGNED IN";
    const { data: admin, error: adminErr } = await supabase.rpc("is_admin");
    const says = adminErr ? `error — ${adminErr.message}` : String(admin);

    // Asking is not proving. The only reliable way to know whether this browser
    // can write a listing is to write one, so it writes one and takes it away
    // again - which is why 0019 exists.
    const probe = `zz-access-probe-${Date.now()}`;
    let wrote = "";
    try {
      const { error } = await supabase
        .from("restaurants")
        .insert({ slug: probe, name: "Access probe", city: "hyderabad", listed: false });
      if (error) {
        console.error("moodbite: access probe write failed", error);
        wrote = `write REFUSED — ${error.message}${error.code ? ` (${error.code})` : ""}`;
      } else {
        const { error: delErr } = await supabase.from("restaurants").delete().eq("slug", probe);
        wrote = delErr
          ? `write worked, cleanup failed — remove ${probe} by hand (${delErr.message})`
          : "write worked and cleaned up";
      }
    } catch (e) {
      wrote = `write threw — ${e instanceof Error ? e.message : String(e)}`;
    }

    setNotice(`This tab: ${who} · is_admin() says ${says} · ${wrote}`);
  }

  if (!supabase) return <p className="mt-3 text-sm text-ink-soft">Supabase is not configured.</p>;

  if (draft) {
    const set = (k: keyof typeof BLANK, v: string | boolean) =>
      setDraft((d) => (d ? { ...d, [k]: v } : d));
    return (
      <div className="mt-4 max-w-xl">
        <label className="block text-sm text-ink-soft" htmlFor="r-name">Name</label>
        <input
          id="r-name"
          value={draft.name}
          onChange={(e) => {
            set("name", e.target.value);
            if (!locked) set("slug", slugify(e.target.value));
          }}
          className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 font-display text-xl focus:border-ink focus:outline-none"
        />
        <p className="mt-2 text-xs text-ink-soft">
          /restaurants/{draft.slug || "…"}
          {locked ? " · fixed, so shared links keep working" : ""}
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-ink-soft" htmlFor="r-area">Area</label>
            <input id="r-area" value={draft.area} onChange={(e) => set("area", e.target.value)}
              placeholder="Banjara Hills"
              className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-sm focus:border-ink focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-ink-soft" htmlFor="r-city">City</label>
            <select id="r-city" value={draft.city} onChange={(e) => set("city", e.target.value)}
              className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-sm focus:border-ink focus:outline-none">
              {CITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-ink-soft" htmlFor="r-lat">Latitude</label>
            <input id="r-lat" value={draft.lat} onChange={(e) => set("lat", e.target.value)}
              placeholder="17.4156"
              className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-sm focus:border-ink focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-ink-soft" htmlFor="r-lon">Longitude</label>
            <input id="r-lon" value={draft.lon} onChange={(e) => set("lon", e.target.value)}
              placeholder="78.4347"
              className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-sm focus:border-ink focus:outline-none" />
          </div>
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="mt-3 border-b border-ink pb-0.5 text-sm disabled:opacity-50"
        >
          {locating ? "Reading location" : "Use this device's location"}
        </button>
        <p className="mt-2 text-xs text-ink-soft">
          Coordinates are what make &quot;was there&quot; possible. Without them a listing can
          still be reviewed, but no review of it can ever be marked as written at the door.
          Adding a place while standing in it is also the only way to get a coordinate that
          is certainly ours rather than a mapping provider&apos;s.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-ink-soft" htmlFor="r-cuisines">Cuisines, comma separated</label>
            <input id="r-cuisines" value={draft.cuisines} onChange={(e) => set("cuisines", e.target.value)}
              placeholder="Hyderabadi, North Indian"
              className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-sm focus:border-ink focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-ink-soft" htmlFor="r-price">Price band</label>
            <select id="r-price" value={draft.price_band} onChange={(e) => set("price_band", e.target.value)}
              className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-sm focus:border-ink focus:outline-none">
              <option value="">Not set</option>
              <option value="1">₹</option><option value="2">₹₹</option>
              <option value="3">₹₹₹</option><option value="4">₹₹₹₹</option>
            </select>
          </div>
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.veg_only} onChange={(e) => set("veg_only", e.target.checked)} />
          <span>Pure veg</span>
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.listed} onChange={(e) => set("listed", e.target.checked)} />
          <span>Listed — visible to everyone</span>
        </label>

        {problem && <p className="mt-4 text-sm text-chilli">{problem}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button onClick={save} disabled={saving}
            className="font-display bg-ink px-6 py-3 text-paper transition-colors hover:bg-chilli disabled:opacity-60">
            {saving ? "Saving" : "Save listing"}
          </button>
          <button onClick={() => { setDraft(null); setProblem(null); }}
            className="text-sm text-ink-soft underline underline-offset-4">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {notice && <p className="mb-4 border-l-2 border-ink pl-3 text-sm text-ink-soft">{notice}</p>}
      {problem && <p className="mb-4 text-sm text-chilli">{problem}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => { setNotice(null); setDraft({ ...BLANK }); }}
          className="font-display border border-ink px-5 py-2.5 text-base transition-colors hover:bg-sage-deep">
          Add a restaurant
        </button>
        <button onClick={checkAccess} className="text-sm text-ink-soft underline underline-offset-4">
          Check my access
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nothing listed yet.</p>
      ) : (
        <ul className="mt-6 max-w-2xl">
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-4 border-b border-ink/10 py-3">
              <div className="min-w-0">
                <p className="font-display text-lg">{r.name}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {!r.listed && <span className="mr-1.5 text-chilli">unlisted</span>}
                  /restaurants/{r.slug}
                  {r.lat === null || r.lon === null ? " · no coordinates" : ""}
                </p>
              </div>
              <button
                onClick={() => {
                  setNotice(null);
                  setDraft({
                    id: r.id, name: r.name, slug: r.slug, area: r.area ?? "", city: r.city,
                    lat: r.lat?.toString() ?? "", lon: r.lon?.toString() ?? "",
                    cuisines: r.cuisines.join(", "),
                    price_band: r.price_band?.toString() ?? "",
                    veg_only: r.veg_only, listed: r.listed,
                  });
                }}
                className="shrink-0 border-b border-ink pb-0.5 text-sm"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
