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
 * The coordinate never leaves the device: the city list ships with the app and
 * the match is a distance calculation, so there is no geocoding service in the
 * path and no reason to send anyone's location anywhere.
 */
export function useCity() {
  const [city, setCity] = useState<City | null>(null);
  const [status, setStatus] = useState<CityStatus>("idle");
  const [km, setKm] = useState<number | null>(null);

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
        if (near) {
          setCity(match);
          setStatus("located");
        } else {
          // too far to claim it as theirs; offer it, do not assume it
          setCity(null);
          setStatus("far");
        }
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  return { city, status, km, locate, choose, cities: CITIES, radiusKm: LOCAL_RADIUS_KM };
}
