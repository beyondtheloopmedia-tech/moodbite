import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { CITY_NAME_BY_SLUG } from "@/lib/cities";
import RestaurantReviews from "@/components/RestaurantReviews";
import { DIMENSIONS, EVIDENCE_BLURB, verdict } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServer();
  const { data } = (await supabase
    ?.from("restaurants")
    .select("name, area, city")
    .eq("slug", slug)
    .maybeSingle()) ?? { data: null };
  if (!data) return { title: "Not found" };
  return {
    title: `${data.name} — hygiene and honest reviews`,
    description: `What people who actually went say about ${data.name}${data.area ? `, ${data.area}` : ""}.`,
  };
}

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServer();
  if (!supabase) notFound();

  const { data: r } = await supabase
    .from("restaurants")
    .select("id, slug, name, area, address, city, lat, lon, cuisines, price_band, veg_only")
    .eq("slug", slug)
    .maybeSingle();
  if (!r) notFound();

  const [{ data: scores }, { data: reviews }, { data: auth }] = await Promise.all([
    supabase.from("restaurant_scores").select("*").eq("restaurant_id", r.id).maybeSingle(),
    supabase
      .from("reviews")
      .select("id, visited_on, hygiene, food, value, as_advertised, wait, body, tags, evidence, created_at")
      .eq("restaurant_id", r.id)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.auth.getUser(),
  ]);

  const n = scores?.reviews ?? 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-14 sm:px-10">
      <Link href="/restaurants" className="text-sm text-ink-soft underline underline-offset-4">
        Restaurants
      </Link>

      <h1 className="font-display mt-6 text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[0.98] tracking-tight">
        {r.name}
      </h1>
      <p className="mt-3 text-ink-soft">
        {[r.area, CITY_NAME_BY_SLUG.get(r.city) ?? r.city].filter(Boolean).join(", ")}
        {r.cuisines.length ? ` · ${r.cuisines.join(", ")}` : ""}
        {r.price_band ? ` · ${"₹".repeat(r.price_band)}` : ""}
        {r.veg_only ? " · pure veg" : ""}
      </p>

      {n === 0 ? (
        <p className="mt-10 border-t border-ink/20 pt-6 text-ink-soft">
          Nobody has reviewed this yet. The first one matters more than the fiftieth.
        </p>
      ) : (
        <div className="mt-10 border-t border-ink/20 pt-6">
          <p className="font-display text-3xl">
            {verdict(Number(scores!.overall))}{" "}
            <span className="text-ink-soft">
              · {Number(scores!.overall).toFixed(1)} from {n} review{n === 1 ? "" : "s"}
            </span>
          </p>
          {/* The shrunk figure is what the word above describes. Showing the
              raw per-axis averages beside it is honest: a reader can see both
              what people said and what we are willing to claim from it. */}
          <dl className="mt-5 space-y-2">
            {DIMENSIONS.map((d) => {
              const v = Number(scores![d.id]);
              return (
                <div key={d.id} className="flex items-center gap-3 text-sm">
                  <dt className="w-32 shrink-0 text-ink-soft">{d.label}</dt>
                  <dd className="flex flex-1 items-center gap-3">
                    <span className="h-1.5 flex-1 bg-ink/10">
                      <span
                        className={`block h-full ${d.lead ? "bg-chilli" : "bg-ink"}`}
                        style={{ width: `${(v / 5) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums">{v.toFixed(1)}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
          {scores!.located_reviews > 0 && (
            <p className="mt-4 text-xs text-ink-soft">
              {scores!.located_reviews} of {n} written at the restaurant.{" "}
              {EVIDENCE_BLURB.located}
            </p>
          )}
        </div>
      )}

      <RestaurantReviews
        restaurantId={r.id}
        restaurantName={r.name}
        lat={r.lat}
        lon={r.lon}
        signedIn={Boolean(auth?.user)}
        initial={reviews ?? []}
      />
    </main>
  );
}
