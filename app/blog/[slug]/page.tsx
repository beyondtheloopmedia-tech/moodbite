import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { parseBody, readingMinutes } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServer();
  const { data } = (await supabase
    ?.from("posts")
    .select("title, excerpt")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle()) ?? { data: null };

  if (!data) return { title: "Not found" };
  return { title: `${data.title} — Moodbite`, description: data.excerpt ?? undefined };
}

/**
 * One post.
 *
 * The body is rendered as React text nodes rather than HTML - see lib/posts.ts.
 * Nothing here calls dangerouslySetInnerHTML, so a script tag typed into a post
 * is displayed as the characters it is, which is the property worth keeping
 * once more than one person can write.
 */
export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServer();
  const { data: post } = (await supabase
    ?.from("posts")
    .select("title, excerpt, body, published_at")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle()) ?? { data: null };

  if (!post) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <Link href="/blog" className="text-sm text-ink-soft underline underline-offset-4">
        Writing
      </Link>

      <h1 className="font-display mt-6 text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-[0.98] tracking-tight">
        {post.title}
      </h1>

      <p className="mt-4 text-sm text-ink-soft">
        {post.published_at
          ? new Date(post.published_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : ""}
        {" · "}
        {readingMinutes(post.body)} min
      </p>

      {post.excerpt && (
        <p className="font-display mt-6 text-xl leading-snug text-ink-soft">{post.excerpt}</p>
      )}

      <article className="mt-10">
        {parseBody(post.body).map((block, i) => {
          if (block.kind === "heading") {
            return (
              <h2 key={i} className="font-display mt-10 text-2xl leading-tight">
                {block.text}
              </h2>
            );
          }
          if (block.kind === "quote") {
            return (
              <blockquote
                key={i}
                className="mt-6 border-l-2 border-ink/30 pl-4 italic text-ink-soft"
              >
                {block.text}
              </blockquote>
            );
          }
          return (
            <p key={i} className="mt-5 whitespace-pre-line leading-relaxed">
              {block.text}
            </p>
          );
        })}
      </article>
    </main>
  );
}
