"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { readingMinutes, slugify } from "@/lib/posts";

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  published: boolean;
  published_at: string | null;
  updated_at: string;
}

const BLANK = { id: "", slug: "", title: "", excerpt: "", body: "", published: false };

/**
 * Writing, from inside the admin page.
 *
 * Writes through the reader's own session under the policies in 0013, the same
 * way every other write in this app does. There is no service_role key here, so
 * an admin flag that is false makes this component inert rather than dangerous.
 */
export default function PostEditor({ initial }: { initial: PostRow[] }) {
  const supabase = getSupabaseBrowser();
  const [posts, setPosts] = useState<PostRow[]>(initial);
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The slug follows the title only until the post exists. After that it is
  // frozen: every link anyone has shared depends on it, and a silent rename
  // breaks all of them at once.
  const locked = Boolean(draft?.id);

  const edit = (p: PostRow) =>
    setDraft({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt ?? "",
      body: p.body,
      published: p.published,
    });

  async function save() {
    if (!supabase || !draft) return;
    const title = draft.title.trim();
    const slug = (draft.slug || slugify(title)).trim();
    if (!title || !slug) {
      setProblem("A post needs a title.");
      return;
    }
    setSaving(true);
    setProblem(null);

    const fields = {
      slug,
      title,
      excerpt: draft.excerpt.trim() || null,
      body: draft.body,
      published: draft.published,
    };

    const { data, error } = draft.id
      ? await supabase.from("posts").update(fields).eq("id", draft.id).select().single()
      : await supabase.from("posts").insert(fields).select().single();

    setSaving(false);
    if (error) {
      // The unique index on slug is the one a writer will actually hit.
      setProblem(
        error.code === "23505" ? "Another post already uses that address." : error.message,
      );
      return;
    }
    const row = data as PostRow;
    setPosts((prev) => {
      const without = prev.filter((p) => p.id !== row.id);
      return [row, ...without].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });
    setDraft(null);
  }

  if (!supabase) {
    return <p className="mt-3 text-sm text-ink-soft">Supabase is not configured.</p>;
  }

  if (draft) {
    return (
      <div className="mt-4 max-w-2xl">
        <label className="block text-sm text-ink-soft" htmlFor="post-title">
          Title
        </label>
        <input
          id="post-title"
          value={draft.title}
          onChange={(e) =>
            setDraft((d) =>
              d ? { ...d, title: e.target.value, slug: locked ? d.slug : slugify(e.target.value) } : d,
            )
          }
          className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 font-display text-xl focus:border-ink focus:outline-none"
        />

        <p className="mt-2 text-xs text-ink-soft">
          /blog/{draft.slug || "…"}
          {locked ? " · fixed once published, so shared links keep working" : ""}
        </p>

        <label className="mt-6 block text-sm text-ink-soft" htmlFor="post-excerpt">
          The line that makes someone click. Rarely the one the piece opens with.
        </label>
        <input
          id="post-excerpt"
          value={draft.excerpt}
          onChange={(e) => setDraft((d) => (d ? { ...d, excerpt: e.target.value } : d))}
          className="mt-1 block w-full border-b border-ink/40 bg-transparent pb-1 text-sm focus:border-ink focus:outline-none"
        />

        <label className="mt-6 block text-sm text-ink-soft" htmlFor="post-body">
          Body. Blank line between paragraphs, <code>## </code> for a heading,
          <code> &gt; </code> for a quote.
        </label>
        <textarea
          id="post-body"
          value={draft.body}
          onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : d))}
          rows={18}
          className="mt-1 block w-full border border-ink/30 bg-paper p-3 text-sm leading-relaxed focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-xs text-ink-soft">
          about {readingMinutes(draft.body)} min to read
        </p>

        <label className="mt-5 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) => setDraft((d) => (d ? { ...d, published: e.target.checked } : d))}
          />
          <span>Published — anyone can read this, signed in or not</span>
        </label>

        {problem && <p className="mt-4 text-sm text-chilli">{problem}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={save}
            disabled={saving}
            className="font-display bg-ink px-6 py-3 text-paper transition-colors hover:bg-chilli disabled:opacity-60"
          >
            {saving ? "Saving" : draft.published ? "Save and publish" : "Save draft"}
          </button>
          <button
            onClick={() => {
              setDraft(null);
              setProblem(null);
            }}
            className="text-sm text-ink-soft underline underline-offset-4"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setDraft({ ...BLANK })}
        className="font-display border border-ink px-5 py-2.5 text-base transition-colors hover:bg-sage-deep"
      >
        Write a post
      </button>

      {posts.length > 0 && (
        <ul className="mt-6 max-w-2xl">
          {posts.map((p) => (
            <li
              key={p.id}
              className="flex items-baseline justify-between gap-4 border-b border-ink/10 py-3"
            >
              <div className="min-w-0">
                <p className="font-display text-lg">{p.title}</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {p.published ? (
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      /blog/{p.slug}
                    </a>
                  ) : (
                    <span>draft · /blog/{p.slug}</span>
                  )}
                  {" · "}
                  {readingMinutes(p.body)} min
                </p>
              </div>
              <button
                onClick={() => edit(p)}
                className="shrink-0 border-b border-ink pb-0.5 text-sm"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      {posts.length === 0 && <p className="mt-4 text-sm text-ink-soft">Nothing written yet.</p>}
    </div>
  );
}
