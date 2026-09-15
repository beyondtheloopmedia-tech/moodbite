import type { City } from "./types";

/**
 * Delivery cities, with the slug Zomato actually uses in its URLs.
 *
 * The slugs are not guessable and are not always the city's current name, so
 * they are verified rather than derived:
 *   - Bengaluru is "bangalore"; "bengaluru" 404s.
 *   - Delhi is "ncr"; "delhi" silently serves a Hyderabad page.
 * An unknown slug does not 404 either, it quietly renders the wrong city, so
 * only slugs from this list are ever put into a link.
 */
export const CITIES: City[] = [
  { slug: "hyderabad", name: "Hyderabad", lat: 17.385, lon: 78.4867 },
  { slug: "ncr", name: "Delhi NCR", lat: 28.6139, lon: 77.209 },
  { slug: "mumbai", name: "Mumbai", lat: 19.076, lon: 72.8777 },
  { slug: "bangalore", name: "Bengaluru", lat: 12.9716, lon: 77.5946 },
  { slug: "chennai", name: "Chennai", lat: 13.0827, lon: 80.2707 },
  { slug: "kolkata", name: "Kolkata", lat: 22.5726, lon: 88.3639 },
  { slug: "pune", name: "Pune", lat: 18.5204, lon: 73.8567 },
  { slug: "ahmedabad", name: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
  { slug: "surat", name: "Surat", lat: 21.1702, lon: 72.8311 },
  { slug: "jaipur", name: "Jaipur", lat: 26.9124, lon: 75.7873 },
  { slug: "lucknow", name: "Lucknow", lat: 26.8467, lon: 80.9462 },
  { slug: "chandigarh", name: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  { slug: "indore", name: "Indore", lat: 22.7196, lon: 75.8577 },
  { slug: "bhopal", name: "Bhopal", lat: 23.2599, lon: 77.4126 },
  { slug: "nagpur", name: "Nagpur", lat: 21.1458, lon: 79.0882 },
  { slug: "visakhapatnam", name: "Visakhapatnam", lat: 17.6868, lon: 83.2185 },
  { slug: "vijayawada", name: "Vijayawada", lat: 16.5062, lon: 80.648 },
  { slug: "coimbatore", name: "Coimbatore", lat: 11.0168, lon: 76.9558 },
  { slug: "kochi", name: "Kochi", lat: 9.9312, lon: 76.2673 },
  { slug: "trivandrum", name: "Thiruvananthapuram", lat: 8.5241, lon: 76.9366 },
  { slug: "mysore", name: "Mysuru", lat: 12.2958, lon: 76.6394 },
  { slug: "goa", name: "Goa", lat: 15.4909, lon: 73.8278 },
  { slug: "bhubaneswar", name: "Bhubaneswar", lat: 20.2961, lon: 85.8245 },
  { slug: "patna", name: "Patna", lat: 25.5941, lon: 85.1376 },
  { slug: "guwahati", name: "Guwahati", lat: 26.1445, lon: 91.7362 },
];

export const DEFAULT_CITY = CITIES[0];

export const findCity = (slug: string) => CITIES.find((c) => c.slug === slug);

/**
 * Past this, "you are in <city>" stops being true. Someone 400km away gets the
 * catalogue and a working link, but no local-favourite claim attached to it.
 */
export const LOCAL_RADIUS_KM = 120;

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Nearest listed city to a coordinate. `near` says whether the match is close
 * enough to treat as "where you are" rather than just the closest pin on a map.
 */
export function nearestCity(lat: number, lon: number): { city: City; km: number; near: boolean } {
  let best = CITIES[0];
  let bestKm = Infinity;
  for (const c of CITIES) {
    const km = haversineKm(lat, lon, c.lat, c.lon);
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return { city: best, km: Math.round(bestKm), near: bestKm <= LOCAL_RADIUS_KM };
}

/**
 * Where a cuisine is from. Used to boost dishes that are a local signature
 * rather than merely available, so Hyderabad leans biryani and Mumbai leans
 * vada pav without either disappearing from the other's list.
 */
export const CUISINE_HOME: Record<string, string[]> = {
  Hyderabadi: ["hyderabad"],
  Andhra: ["hyderabad", "vijayawada", "visakhapatnam"],
  "South Indian": ["chennai", "bangalore", "coimbatore", "kochi", "trivandrum", "mysore"],
  "North Indian": ["ncr", "chandigarh", "lucknow", "jaipur"],
  "Indo-Chinese": ["kolkata", "ncr", "mumbai"],
  "Indian sweets": ["kolkata", "ncr", "jaipur"],
};
