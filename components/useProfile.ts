"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { parseInterests, type InterestId } from "@/lib/interests";
import type { Diet, SpiceLevel } from "@/lib/types";

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
 *
 * `home_city` and `diet` existed in the schema from the start and nothing ever
 * wrote them, which is why every account showed no city. The profile step is
 * what fills them.
 */
export function useProfile(userId: string | null) {
  const [interests, setInterests] = useState<InterestId[]>([]);
  const [homeCity, setHomeCity] = useState<string | null>(null);
  const [diet, setDiet] = useState<Diet | null>(null);
  const [ready, setReady] = useState(false);
  const [hasProfileRow, setHasProfileRow] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [spice, setSpice] = useState<SpiceLevel | null>(null);
  const [avoidCuisines, setAvoidCuisines] = useState<string[]>([]);
  const merged = useRef<string | null>(null);

  useEffect(() => {
    const local = readLocal();
    const supabase = getSupabaseBrowser();

    if (!userId || !supabase) {
      setInterests(local);
      setHomeCity(null);
      setDiet(null);
      setHasProfileRow(false);
      setIsPro(false);
      setSpice(null);
      setAvoidCuisines([]);
      setReady(true);
      return;
    }

    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("interests, home_city, diet, is_pro, spice_level, avoid_cuisines")
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
      setHomeCity(data?.home_city ?? null);
      setDiet((data?.diet as Diet | null) ?? null);
      setHasProfileRow(Boolean(data));
      setIsPro(Boolean(data?.is_pro));
      setSpice((data?.spice_level as SpiceLevel | null) ?? null);
      setAvoidCuisines(data?.avoid_cuisines ?? []);

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

  /** Writes the whole profile at once, from the setup step. */
  const saveProfile = useCallback(
    async (next: {
      homeCity: string | null;
      diet: Diet | null;
      interests: InterestId[];
      spice: SpiceLevel | null;
      avoidCuisines: string[];
    }) => {
      setHomeCity(next.homeCity);
      setDiet(next.diet);
      setInterests(next.interests);
      setSpice(next.spice);
      setAvoidCuisines(next.avoidCuisines);
      writeLocal(next.interests);

      const supabase = getSupabaseBrowser();
      if (!userId || !supabase) return true;

      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        home_city: next.homeCity,
        diet: next.diet,
        interests: next.interests,
        spice_level: next.spice,
        avoid_cuisines: next.avoidCuisines,
      });
      if (error) console.warn("moodbite: could not save profile", error.message);
      return !error;
    },
    [userId],
  );

  // Signed in, loaded, and the two fields the setup step exists to fill are
  // both still empty. Interests are deliberately not part of this test: they
  // can be set without an account, so having some is no evidence of setup.
  const needsSetup = Boolean(userId) && ready && hasProfileRow && !homeCity && !diet;

  return {
    interests,
    toggle,
    homeCity,
    diet,
    isPro,
    spice,
    avoidCuisines,
    saveProfile,
    ready,
    needsSetup,
  };
}
