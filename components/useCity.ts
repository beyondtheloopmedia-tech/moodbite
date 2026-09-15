"use client";

import { useCallback, useEffect, useState } from "react";
import { CITIES, LOCAL_RADIUS_KM, findCity, nearestCity } from "@/lib/cities";
import type { City } from "@/lib/types";

const STORAGE_KEY = "moodbite.city";

export type CityStatus =
  | "idle" // nothing asked for yet
  | "locating" // waiting on the browser
  | "located" // we know where you are
  | "chosen" // you told us
  | "denied" // permission refused
  | "unavailable" // no geolocation, or the lookup failed
  | "far"; // located, but nowhere near a city we deliver in

/**
 * Turns a browser coordinate into one of the cities we actually have links for.
 *
 * Choosing the city needs no network at all: the city list ships with the app
 * and the match is a distance calculation, so there is no geocoding service in
 * that path.
 *
 * `coords` is the one exception, and it is deliberately blunted. The precise
 * reading is rounded to two decimal places inside the callback below and the
 * exact figure is discarded there and then, so it never reaches React state,
 * a request, or anywhere else. Two decimal places is about a kilometre: enough
 * to search for restaurants around someone, not enough to find their flat. It
 * is sent only when they ask for nearby places, and only ever to our own
 * server.
 */
const COARSE = 100; // two decimal places, roughly a kilometre

const coarse = (n: number) => Math.round(n * COARSE) / COARSE;

/**
 * Whether we have a usable coordinate, separately from which city is selected.
 *
 * These are different questions and used to be conflated. Somebody returning
 * with a city saved from last time has a city and no coordinate at all, and
 * "near me" computed from a city centroid is not near them: the centre of
 * Hyderabad is fifteen kilometres from most of Hyderabad.
 */
export type CoordsStatus = "idle" | "asking" | "ok" | "denied";

export function useCity() {
  const [city, setCity] = useState<City | null>(null);
  const [status, setStatus] = useState<CityStatus>("idle");
  const [km, setKm] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [coordsStatus, setCoordsStatus] = useState<CoordsStatus>("idle");

  // a city picked by hand outlives the session; a located one is re-read each time
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const found = saved ? findCity(saved) : undefined;
      if (found) {
        setCity(found);
        setStatus("chosen");
      }
    } catch {
      // private mode, or storage blocked: not worth surfacing
    }
  }, []);

  const choose = useCallback((slug: string) => {
    const found = findCity(slug);
    if (!found) return;
    setCity(found);
    setStatus("chosen");
    setKm(null);
    // Naming a city overrides wherever the device thinks it is, and rightly:
    // somebody in Delhi asking about Mumbai wants the centre of Mumbai, not a
    // radius drawn around themselves.
    setCoords(null);
    setCoordsStatus("idle");
    try {
      localStorage.setItem(STORAGE_KEY, found.slug);
    } catch {
      // the choice still holds for this session
    }
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { city: match, km: distance, near } = nearestCity(
          pos.coords.latitude,
          pos.coords.longitude,
        );
        setKm(distance);
        // rounded here, at the only point the precise value exists
        setCoords({ lat: coarse(pos.coords.latitude), lon: coarse(pos.coords.longitude) });
        setCoordsStatus("ok");
        if (near) {
          setCity(match);
          setStatus("located");
        } else {
          // too far to claim it as theirs; offer it, do not assume it
          setCity(null);
          setStatus("far");
        }
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        setCoordsStatus("denied");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  /**
   * Ask for a coordinate without touching the chosen city.
   *
   * `locate` picks the city as well, which is right on the opening screen and
   * wrong later: somebody who has already said "Mumbai" should not have that
   * silently rewritten because a permission prompt finally got answered. This
   * is for the one place that genuinely needs a point rather than a city, and
   * it resolves to a terminal state either way so the caller never hangs.
   */
  const refineCoords = useCallback(() => {
    if (coords) {
      setCoordsStatus("ok");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCoordsStatus("denied");
      return;
    }
    setCoordsStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: coarse(pos.coords.latitude), lon: coarse(pos.coords.longitude) });
        setCoordsStatus("ok");
      },
      // Declining is a normal answer, not a failure. The city centroid is the
      // fallback and the panel says so rather than claiming to be near anyone.
      () => setCoordsStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, [coords]);

  return {
    city,
    status,
    km,
    coords,
    coordsStatus,
    locate,
    refineCoords,
    choose,
    cities: CITIES,
    radiusKm: LOCAL_RADIUS_KM,
  };
}
