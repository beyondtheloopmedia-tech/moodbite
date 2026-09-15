"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { DIMENSIONS, LOCATED_RADIUS_M, TAGS, type Evidence, type TagId } from "@/lib/reviews";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Writing a review.
 *
 * Two things are load bearing here and both are about honesty rather than
 * features. The evidence level is decided by measuring, never by asking - a
 * checkbox saying "I really went" is worth nothing. And the score inputs start
 * empty rather than at three, because a prefilled middle is a vote nobody cast
 * and it drags every average toward the centre.
 */
export default function ReviewForm({
  restaurantId,
  restaurantName,
  lat,
  lon,
  signedIn,
  onDone,
}: {
  restaurantId: string;
  restaurantName: string;
  lat: number | null;
  lon: number | null;
  signedIn: boolean;
  onDone: () => void;
}) {
  const supabase = getSupabaseBrowser();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [tags, setTags] = useState<TagId[]>([]);
  const [body, setBody] = useState("");
  const [visited, setVisited] = useState(today());
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const missing = DIMENSIONS.filter((d) => !scores[d.id]).map((d) => d.label);

  /**
   * Measure, do not ask. Resolves to 'none' on refusal, on error, on a browser
   * without geolocation, and on a restaurant we have no coordinates for -
   * every one of which means we genuinely do not know, which is what 'none'
   * says.
   */
  function evidenceFor(): Promise<Evidence> {
    return new Promise((resolve) => {
      if (lat === null || lon === null) return resolve("none");
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve("none");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(pos.coords.latitude - lat);
          const dLon = toRad(pos.coords.longitude - lon);
          const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat)) * Math.cos(toRad(pos.coords.latitude)) * Math.sin(dLon / 2) ** 2;
          const metres = 2 * 6371000 * Math.asin(Math.sqrt(h));
          resolve(metres <= LOCATED_RADIUS_M ? "located" : "none");
        },
        () => resolve("none"),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }

  async function submit() {
    if (!supabase) return;
    if (missing.length) {
      setProblem(`Still to score: ${missing.join(", ")}.`);
      return;
    }
    setSaving(true);
    setProblem(null);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSaving(false);
      setProblem("Sign in first — reviews are attached to an account.");
      return;
    }

    const evidence = await evidenceFor();
    const { error } = await supabase.from("reviews").insert({
      restaurant_id: restaurantId,
      author_id: auth.user.id,
      visited_on: visited,
      hygiene: scores.hygiene,
      food: scores.food,
      value: scores.value,
      as_advertised: scores.as_advertised,
      wait: scores.wait,
      body: body.trim(),
      tags,
      evidence,
    });

    setSaving(false);
    if (error) {
      setProblem(
        error.code === "23505"
          ? "You have already reviewed this visit. Edit that one instead."
          : error.message,
      );
      return;
    }
    onDone();
  }

  if (!signedIn) {
    return (
      <p className="mt-4 text-sm text-ink-soft">
        Sign in to review {restaurantName}. Reviews are attached to an account so one
        bad evening cannot become five reviews.
      </p>
    );
  }

  return (
    <div className="mt-6 max-w-xl">
      {DIMENSIONS.map((d) => (
        <fieldset key={d.id} className="mt-6 first:mt-0">
          <legend className="font-display text-lg">
            {d.ask}
            {d.lead && <span className="ml-2 text-xs uppercase tracking-wide text-chilli">the point</span>}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={scores[d.id] === n}
                onClick={() => setScores((s) => ({ ...s, [d.id]: n }))}
                className={`h-10 w-10 border text-sm transition-colors ${
                  scores[d.id] === n
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/30 text-ink hover:bg-sage-deep"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">
            1 — {d.low} · 5 — {d.high}
          </p>
        </fieldset>
      ))}

      <fieldset className="mt-8">
        <legend className="font-display text-lg">Anything true about it?</legend>
        <p className="mt-1 text-xs text-ink-soft">
          Facts rather than opinions. Only tick what you saw.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.blurb}
              aria-pressed={tags.includes(t.id)}
              onClick={() =>
                setTags((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))
              }
              className={`border px-3 py-1.5 text-sm transition-colors ${
                tags.includes(t.id)
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/30 text-ink hover:bg-sage-deep"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-8">
        <label htmlFor="visited" className="text-sm text-ink-soft">
          When did you go?
        </label>
        <input
          id="visited"
          type="date"
          value={visited}
          max={today()}
          onChange={(e) => setVisited(e.target.value)}
          className="mt-1 block border-b border-ink/40 bg-transparent pb-1 text-ink focus:border-ink focus:outline-none"
        />
      </div>

      <div className="mt-6">
        <label htmlFor="review-body" className="text-sm text-ink-soft">
          What should somebody know before they go?
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mt-1 block w-full border border-ink/30 bg-paper p-3 text-sm leading-relaxed focus:border-ink focus:outline-none"
        />
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        When you post, we check whether your device is at the restaurant. If it is, this
        is marked <em>Was there</em>. We never ask you to confirm it — a tickbox saying
        you went is worth nothing.
      </p>

      {problem && <p className="mt-4 text-sm text-chilli">{problem}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={submit}
          disabled={saving}
          className="font-display bg-ink px-6 py-3 text-paper transition-colors hover:bg-chilli disabled:opacity-60"
        >
          {saving ? "Posting" : "Post review"}
        </button>
        <button onClick={onDone} className="text-sm text-ink-soft underline underline-offset-4">
          Cancel
        </button>
      </div>
    </div>
  );
}
