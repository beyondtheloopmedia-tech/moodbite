"use client";

import { useState } from "react";
import ReviewForm from "./ReviewForm";
import { EVIDENCE_BLURB, EVIDENCE_LABEL, TAGS, type Evidence } from "@/lib/reviews";

export interface ReviewRow {
  id: string;
  visited_on: string;
  hygiene: number;
  food: number;
  value: number;
  as_advertised: number;
  wait: number;
  body: string;
  tags: string[];
  evidence: Evidence;
  created_at: string;
}

const TAG_LABEL = new Map(TAGS.map((t) => [t.id as string, t.label]));

/**
 * The reviews, and the way in to writing one.
 *
 * Reviewers are shown by their evidence rather than by a name. That is not a
 * missing feature: a hygiene complaint about a business somebody has to keep
 * living near is exactly the kind of thing people only write when they are not
 * identifiable, and the same reasoning Glassdoor applies to employers applies
 * here. What is on display instead is how much we actually know about the
 * visit, which is the thing a reader should be weighing anyway.
 */
export default function RestaurantReviews({
  restaurantId,
  restaurantName,
  lat,
  lon,
  signedIn,
  initial,
}: {
  restaurantId: string;
  restaurantName: string;
  lat: number | null;
  lon: number | null;
  signedIn: boolean;
  initial: ReviewRow[];
}) {
  const [writing, setWriting] = useState(false);
  const [posted, setPosted] = useState(false);

  return (
    <section className="mt-12 border-t border-ink/20 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-xl">What people said</h2>
        {!writing && (
          <button
            onClick={() => setWriting(true)}
            className="font-display border border-ink px-5 py-2.5 text-base transition-colors hover:bg-sage-deep"
          >
            Write a review
          </button>
        )}
      </div>

      {posted && (
        <p className="mt-4 border-l-2 border-ink pl-3 text-sm text-ink-soft">
          Posted. Reload to see it in the list and in the scores above.
        </p>
      )}

      {writing && (
        <ReviewForm
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          lat={lat}
          lon={lon}
          signedIn={signedIn}
          onDone={() => {
            setWriting(false);
            setPosted(true);
          }}
        />
      )}

      {initial.length === 0 && !writing && (
        <p className="mt-4 text-sm text-ink-soft">Nothing yet.</p>
      )}

      <ul className="mt-6">
        {initial.map((r) => (
          <li key={r.id} className="border-t border-ink/10 py-6 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                title={EVIDENCE_BLURB[r.evidence]}
                className={`border px-1.5 py-0.5 text-xs uppercase tracking-wide ${
                  r.evidence === "located"
                    ? "border-ink text-ink"
                    : "border-ink/30 text-ink-soft"
                }`}
              >
                {EVIDENCE_LABEL[r.evidence]}
              </span>
              <span className="text-sm text-ink-soft">
                went {new Date(r.visited_on).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>

            <p className="mt-2 text-sm text-ink-soft">
              Hygiene {r.hygiene} · Food {r.food} · Value {r.value} · As advertised{" "}
              {r.as_advertised} · Speed {r.wait}
            </p>

            {r.body && <p className="mt-3 whitespace-pre-line leading-relaxed">{r.body}</p>}

            {r.tags.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-1.5">
                {r.tags.map((t) => (
                  <span key={t} className="border border-ink/25 px-2 py-0.5 text-xs text-ink-soft">
                    {TAG_LABEL.get(t) ?? t}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
