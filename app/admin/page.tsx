import { getSupabaseServer } from "@/lib/supabase/server";
import { DISHES } from "@/lib/dishes";
import { CITIES } from "@/lib/cities";
import { DAY_PARTS } from "@/lib/daypart";
import ResendLink from "@/components/admin/ResendLink";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moodbite admin", robots: { index: false, follow: false } };

const DISH_NAME = new Map(DISHES.map((d) => [d.id, d.name]));

const CITY_NAME = new Map(CITIES.map((c) => [c.slug, c.name]));
const DAY_PART_ORDER = DAY_PARTS.map((d) => d.id);

const LABEL: Record<string, string> = {
  stressed: "Stressed",
  flat: "Flat",
  fine: "Fine",
  celebrating: "Celebrating",
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
  latenight: "Late night",
  clear: "Clear",
  cloudy: "Cloudy",
  rain: "Rain",
  drizzle: "Drizzle",
  storm: "Storm",
  fog: "Fog",
  snow: "Snow",
};

type Tally = { shown: number; clicked: number };

/**
 * Group the log by one column and count clicks against impressions.
 *
 * Clicks alone would just rank whatever is shown most. The ratio is what says
 * whether the engine was right, which is the only question this table can
 * usefully answer.
 */
function groupBy(
  log: { dish_id: string; action: string }[],
  key: (e: never) => string | null,
) {
  const out = new Map<string, Map<string, Tally>>();
  for (const e of log) {
    const bucket = key(e as never) ?? "unrecorded";
    if (!out.has(bucket)) out.set(bucket, new Map());
    const dishes = out.get(bucket)!;
    const cur = dishes.get(e.dish_id) ?? { shown: 0, clicked: 0 };
    if (e.action === "clicked") cur.clicked += 1;
    else cur.shown += 1;
    dishes.set(e.dish_id, cur);
  }
  return out;
}

/**
 * Admin panel.
 *
 * Reads through the viewer's own session under the admin policies in
 * 0002_admin.sql. There is no service_role key in this application, so a bug
 * here leaks nothing that the database would not already hand this user: if
 * `is_admin` is false the queries come back empty on their own, and the guard
 * below is the second lock rather than the only one.
 */
export default async function AdminPage() {
  const supabase = await getSupabaseServer();
  if (!supabase) return <Denied reason="Supabase is not configured." />;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return <Denied reason="Sign in first." />;

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!me?.is_admin) return <Denied reason="This account is not an admin." />;

  const [{ data: profiles }, { data: events }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, interests, home_city, diet, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("recommendation_events")
      .select(
        "dish_id, action, mood, energy, hunger, palate, patience, diet, slot, day_part, city, weather, temp_c, interests, heat_override, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const rows = profiles ?? [];
  const log = events ?? [];

  const byMood = groupBy(log, (e: { mood: string | null }) => e.mood);
  const byCity = groupBy(log, (e: { city: string | null }) => e.city);
  const byDayPart = groupBy(log, (e: { day_part: string | null; slot: string | null }) =>
    e.day_part ?? e.slot,
  );
  const byWeather = groupBy(log, (e: { weather: string | null }) => e.weather);

  const ordered = (m: Map<string, Map<string, Tally>>, first: string[]) =>
    [...m.keys()].sort((a, b) => {
      const ia = first.indexOf(a);
      const ib = first.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  // The slider is the reader overruling the engine, so it is worth its own count.
  const overrides = log.filter(
    (e: { heat_override: number | null }) => e.heat_override !== null,
  ).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Moodbite admin</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Signed in as {auth.user.email}. Read only: nothing on this page can change a
        user&apos;s data.
      </p>

      <section className="mt-12">
        <h2 className="font-display text-xl">Sign-ups</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {rows.length} account{rows.length === 1 ? "" : "s"}, newest first.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-left text-ink-soft">
                <th className="py-2 font-normal">Email</th>
                <th className="py-2 font-normal">Joined</th>
                <th className="py-2 font-normal">City</th>
                <th className="py-2 font-normal">Preferences</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-ink/10">
                  <td className="py-2.5 pr-4">{p.email ?? <span className="text-ink-soft">—</span>}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-ink-soft">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 pr-4 text-ink-soft">{p.home_city ?? "—"}</td>
                  <td className="py-2.5 text-ink-soft">
                    {p.interests?.length ? p.interests.join(", ") : "none set"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-ink-soft">
                    No accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl">What gets ordered</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Clicks against impressions, from {log.length} logged event
          {log.length === 1 ? "" : "s"}. A dish with many impressions and no clicks is
          the engine being confidently wrong.
          {overrides > 0 && (
            <>
              {" "}
              The heat slider was moved on {overrides} of them, which is a reader
              correcting the engine outright.
            </>
          )}
        </p>

        {log.length === 0 && (
          <p className="mt-4 text-sm text-ink-soft">
            Nothing logged yet. Events are only recorded for signed-in users.
          </p>
        )}

        <Breakdown title="By mood" groups={byMood} keys={ordered(byMood, ["stressed", "flat", "fine", "celebrating"])} />
        <Breakdown title="By time of day" groups={byDayPart} keys={ordered(byDayPart, DAY_PART_ORDER)} />
        <Breakdown title="By city" groups={byCity} keys={ordered(byCity, [...CITY_NAME.keys()])} name={(k) => CITY_NAME.get(k) ?? k} />
        <Breakdown title="By weather" groups={byWeather} keys={ordered(byWeather, ["clear", "cloudy", "rain", "drizzle", "storm", "fog", "snow"])} />
      </section>

      <section className="mt-12 max-w-lg">
        <h2 className="font-display text-xl">Help someone sign in</h2>
        <p className="mt-1 text-sm text-ink-soft">
          There are no passwords to reset. Sign-in is a one-time code, so the fix for
          &quot;I can&apos;t get in&quot; is a fresh one. The code goes to the address below, never
          to you.
        </p>
        <ResendLink />
      </section>
    </main>
  );
}

function Breakdown({
  title,
  groups,
  keys,
  name,
}: {
  title: string;
  groups: Map<string, Map<string, Tally>>;
  keys: string[];
  name?: (key: string) => string;
}) {
  if (keys.length === 0) return null;
  return (
    <div className="mt-8">
      <h3 className="font-display text-lg">{title}</h3>
      <div className="mt-3 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {keys.map((key) => {
          const dishes = [...groups.get(key)!.entries()]
            .sort((a, b) => b[1].clicked - a[1].clicked || b[1].shown - a[1].shown)
            .slice(0, 6);
          return (
            <div key={key}>
              <h4 className="text-sm text-ink-soft">
                {name?.(key) ?? LABEL[key] ?? (key === "unrecorded" ? "Not recorded" : key)}
              </h4>
              <ul className="mt-1">
                {dishes.map(([dishId, c]) => (
                  <li
                    key={dishId}
                    className="flex items-baseline justify-between gap-3 border-b border-ink/10 py-1.5 text-sm"
                  >
                    <span>{DISH_NAME.get(dishId) ?? dishId}</span>
                    <span className="shrink-0 tabular-nums text-ink-soft">
                      {c.clicked}/{c.shown}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Denied({ reason }: { reason: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="font-display text-2xl">Not available</h1>
      <p className="mt-3 text-sm text-ink-soft">{reason}</p>
    </main>
  );
}
