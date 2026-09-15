import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { readingMinutes } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Moodbite — writing",
  description: "Notes on eating well, ordering badly, and what the data says about both.",
};

/**
 * The index.
 *
 * Reads with the visitor's own session, or with none at all. The policy in 0013
 * returns published rows to anybody and drafts to nobody, so there is no filter
 * here doing security work - `published` is enforced in the database, and a bug
 * in this file cannot leak a draft.
 */
export default async function BlogIndex() {
  const supabase = await getSupabaseServer();
  const { data } = (await supabase
    ?.from("posts")
    .select("slug, title, excerpt, body, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(50)) ?? { data: null };

  const posts = data ?? [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <Link href="/" className="text-sm text-ink-soft underline underline-offset-4">
        Moodbite
      </Link>

      <h1 className="font-display mt-6 text-[clamp(2.25rem,8vw,4rem)] font-semibold leading-[0.95] tracking-tight">
        Writing
      </h1>

      {posts.length === 0 ? (
        <p className="mt-8 text-ink-soft">Nothing published yet.</p>
      ) : (
        <ul className="mt-12">
          {posts.map((p) => (
            <li key={p.slug} className="border-t border-ink/15 py-7">
              <Link href={`/blog/${p.slug}`} className="group block">
                <h2 className="font-display text-2xl leading-tight transition-colors group-hover:text-chilli">
                  {p.title}
                </h2>
                {p.excerpt && (
                  <p className="mt-2 leading-relaxed text-ink-soft">{p.excerpt}</p>
                )}
                <p className="mt-2 text-xs text-ink-soft">
                  {p.published_at
                    ? new Date(p.published_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : ""}
                  {" · "}
                  {readingMinutes(p.body)} min
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
