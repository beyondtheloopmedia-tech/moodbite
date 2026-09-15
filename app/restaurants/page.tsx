import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { CITIES, CITY_NAME_BY_SLUG } from "@/lib/cities";
import { verdict } from "@/lib/reviews";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Restaurants — hygiene first",
  description:
    "Honest reviews of where to eat, scored on hygiene, food, value, whether it matched the photos, and speed.",
};

export default async function Restaurants({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const supabase = await getSupabaseServer();

  let query = supabase
    ?.from("restaurants")
    .select("id, slug, name, area, city, cuisines, price_band, veg_only")
    .eq("listed", true)
    .order("name")
    .limit(200);
  if (city && CITY_NAME_BY_SLUG.has(city)) query = query?.eq("city", city);

  const [{ data: rows }, { data: scores }] = await Promise.all([
    query ?? Promise.resolve({ data: null }),
    supabase?.from("restaurant_scores").select("*") ?? Promise.resolve({ data: null }),
  ]);

  const restaurants = rows ?? [];
  // The view is keyed by id and the list is keyed by slug, so the join happens
  // here rather than in SQL; at a couple of hundred rows that is free.
  const byId = new Map((scores ?? []).map((s) => [s.restaurant_id, s]));
  const present = new Set(restaurants.map((r) => r.city));

  return (
    <main className="mx-auto max-w-3xl px-6 py-14 sm:px-10">
      <Link href="/" className="text-sm text-ink-soft underline underline-offset-4">
        Moodbite
      </Link>

      <h1 className="font-display mt-6 text-[clamp(2.25rem,8vw,4rem)] font-semibold leading-[0.95] tracking-tight">
        Where to eat,
        <br />
        hygiene first.
      </h1>
      <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-soft">
        Every other site gives a restaurant one number out of five and leaves you
        guessing which part of it was good. These are scored on five separate things,
        by people who went, and the washroom counts.
      </p>

      {present.size > 1 && (
        <div className="mt-8 flex flex-wrap gap-2 text-sm">
          <Link
            href="/restaurants"
            className={`border px-3 py-1.5 ${!city ? "border-ink bg-ink text-paper" : "border-ink/30"}`}
          >
            Everywhere
          </Link>
          {CITIES.filter((c) => present.has(c.slug)).map((c) => (
            <Link
              key={c.slug}
              href={`/restaurants?city=${c.slug}`}
              className={`border px-3 py-1.5 ${
                city === c.slug ? "border-ink bg-ink text-paper" : "border-ink/30"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {restaurants.length === 0 ? (
        <p className="mt-12 text-ink-soft">Nothing listed here yet.</p>
      ) : (
        <ul className="mt-10">
          {restaurants.map((r) => {
            const s = byId.get(r.id);
            return (
              <li key={r.slug} className="border-t border-ink/15 py-6">
                <Link href={`/restaurants/${r.slug}`} className="group block">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <h2 className="font-display text-2xl leading-tight transition-colors group-hover:text-chilli">
                      {r.name}
                    </h2>
                    {s ? (
                      <p className="shrink-0 text-sm">
                        <span className="font-display text-lg">{verdict(Number(s.overall))}</span>
                        <span className="text-ink-soft">
                          {" "}
                          · hygiene {Number(s.hygiene).toFixed(1)} · {s.reviews} review
                          {s.reviews === 1 ? "" : "s"}
                        </span>
                      </p>
                    ) : (
                      <p className="shrink-0 text-sm text-ink-soft">No reviews yet</p>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    {[r.area, CITY_NAME_BY_SLUG.get(r.city) ?? r.city].filter(Boolean).join(", ")}
                    {r.cuisines.length ? ` · ${r.cuisines.join(", ")}` : ""}
                    {r.price_band ? ` · ${"₹".repeat(r.price_band)}` : ""}
                    {r.veg_only ? " · pure veg" : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
