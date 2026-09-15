"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { parseInterests, type InterestId } from "@/lib/interests";

const STORAGE_KEY = "moodbite.interests";

const readLocal = (): InterestId[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // parseInterests drops anything unrecognised, so stale or hand-edited
    // storage can never widen the type
    return parseInterests(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
};

const writeLocal = (v: InterestId[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // private mode, or storage blocked: the choice still holds for this session
  }
};

/**
 * Standing preferences, from wherever they happen to live.
 *
 * Signed out, that is localStorage, and the feature works with no account at
 * all. Signed in, it is the `profiles` row, so preferences follow you between
 * devices. localStorage is still written either way, so signing out does not
 * feel like losing your settings.
 */
export function useProfile(userId: string | null) {
  const [interests, setInterests] = useState<InterestId[]>([]);
  const [ready, setReady] = useState(false);
  const merged = useRef<string | null>(null);

  useEffect(() => {
    const local = readLocal();
    const supabase = getSupabaseBrowser();

    if (!userId || !supabase) {
      setInterests(local);
      setReady(true);
      return;
    }

    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("interests")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        // Offline, or the schema is not applied yet. Local still works.
        setInterests(local);
        setReady(true);
        return;
      }

      const remote = parseInterests(data?.interests);

      // First sign-in on this browser: carry what was picked while signed out
      // rather than silently discarding it for an empty profile.
      if (remote.length === 0 && local.length > 0 && merged.current !== userId) {
        merged.current = userId;
        setInterests(local);
        setReady(true);
        await supabase.from("profiles").upsert({ id: userId, interests: local });
        return;
      }

      setInterests(remote);
      writeLocal(remote);
      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const toggle = useCallback(
    (id: InterestId) => {
      const next = interests.includes(id)
        ? interests.filter((i) => i !== id)
        : [...interests, id];

      setInterests(next);
      writeLocal(next);

      const supabase = getSupabaseBrowser();
      if (!userId || !supabase) return;

      // A supabase-js builder is lazy: it only issues the request when it is
      // awaited or given a .then. Dropping it on the floor sends nothing at
      // all, silently, so the result is handled rather than discarded.
      supabase
        .from("profiles")
        .upsert({ id: userId, interests: next })
        .then(({ error }) => {
          if (error) {
            // The UI and localStorage already moved; the next load reconciles.
            console.warn("moodbite: could not save interests", error.message);
          }
        });
    },
    [interests, userId],
  );

  return { interests, toggle, ready };
}
