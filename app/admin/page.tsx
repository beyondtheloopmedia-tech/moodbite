import { getSupabaseServer } from "@/lib/supabase/server";
import { DISHES } from "@/lib/dishes";
import ResendLink from "@/components/admin/ResendLink";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moodbite admin", robots: { index: false, follow: false } };

const DISH_NAME = new Map(DISHES.map((d) => [d.id, d.name]));

const MOOD_LABEL: Record<string, string> = {
  stressed: "Stressed",
  flat: "Flat",
  fine: "Fine",
  celebrating: "Celebrating",
};

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
      .select("dish_id, action, mood, slot, city, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const rows = profiles ?? [];
  const log = events ?? [];

  // Clicks per mood per dish. Impressions are the denominator that stops a
  // dish looking popular purely because it is shown constantly.
  const byMood = new Map<string, Map<string, { shown: number; clicked: number }>>();
  for (const e of log) {
    const mood = e.mood ?? "unrecorded";
    if (!byMood.has(mood)) byMood.set(mood, new Map());
    const dishes = byMood.get(mood)!;
    const cur = dishes.get(e.dish_id) ?? { shown: 0, clicked: 0 };
    if (e.action === "clicked") cur.clicked += 1;
    else cur.shown += 1;
    dishes.set(e.dish_id, cur);
  }

  const moodOrder = ["stressed", "flat", "fine", "celebrating", "unrecorded"].filter((m) =>
    byMood.has(m),
  );

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
        <h2 className="font-display text-xl">What gets ordered, by mood</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Clicks against impressions, from {log.length} logged event
          {log.length === 1 ? "" : "s"}. A dish with many impressions and no clicks is
          the engine being confidently wrong.
        </p>

        {moodOrder.length === 0 && (
          <p className="mt-4 text-sm text-ink-soft">
            Nothing logged yet. Events are only recorded for signed-in users.
          </p>
        )}

        <div className="mt-4 grid gap-8 sm:grid-cols-2">
          {moodOrder.map((mood) => {
            const dishes = [...byMood.get(mood)!.entries()]
              .sort((a, b) => b[1].clicked - a[1].clicked || b[1].shown - a[1].shown)
              .slice(0, 8);
            return (
              <div key={mood}>
                <h3 className="font-display text-lg">{MOOD_LABEL[mood] ?? "Not recorded"}</h3>
                <ul className="mt-2">
                  {dishes.map(([dishId, c]) => (
                    <li
                      key={dishId}
                      className="flex items-baseline justify-between gap-3 border-b border-ink/10 py-1.5"
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

function Denied({ reason }: { reason: string }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="font-display text-2xl">Not available</h1>
      <p className="mt-3 text-sm text-ink-soft">{reason}</p>
    </main>
  );
}
