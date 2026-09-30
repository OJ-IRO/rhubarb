/**
 * Where a conversation happened, as a person would say it: "Osaka Castle Park, Osaka" or
 * "Minato, Osaka". Bee sends a full street address with coordinates. Rhubarb never keeps either:
 * only a landmark or neighbourhood, and nothing at all for the wearer's most-visited place, which
 * is almost always where they live.
 */

export interface BeeLocation {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Home {
  latitude: number;
  longitude: number;
}

// Words that make a part of an address a place worth naming.
const LANDMARK = /\b(park|castle|station|temple|shrine|museum|wheel|tower|market|aquarium|village|university|college|airport|mall|stadium|arena|beach|garden|gardens|zoo|bridge|harbou?r|port|palace|hall|center|centre|plaza|square|pier|island|onsen|cathedral|church|library|terminal|dome)\b|[寺社城駅園館]/i;
// Parts that are a street, or too big to mean anything.
const STREET = /\b(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd|lane|drive|dori|dōri|highway|route)\b|通り/i;
const COUNTRY_OR_REGION = /^(japan|united states( of america)?|usa|us|canada|united kingdom|uk|australia|new zealand|south korea|korea|china|taiwan|hong kong|singapore|france|germany|spain|italy|mexico|honshu|kyushu|hokkaido|shikoku|okinawa)$/i;

/** A short, safe label from Bee's address: a landmark if there is one, else the ward and city. Never a street or number. */
export function placeLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    // house numbers, block numbers and postcodes all carry digits
    .filter((p) => !/\d/.test(p))
    .filter((p) => !COUNTRY_OR_REGION.test(p));
  const landmark = parts.find((p) => LANDMARK.test(p) && !STREET.test(p));
  const areas = parts.filter((p) => p !== landmark && !STREET.test(p) && !/-ch[oō]me$/i.test(p));
  const unique = [...new Set(areas)];
  const city = unique[0];
  if (!city) return landmark ?? null;
  if (landmark) return `${landmark}, ${city}`;
  const ward = unique.find((p) => p !== city);
  return ward ? `${ward}, ${city}` : city;
}

/** Metres between two points. */
export function distanceM(a: Home, b: Home): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const HOME_RADIUS_M = 250;

/** The label for a conversation, or null when it happened at home or Bee gave nothing usable. */
export function placeFor(loc: BeeLocation | null | undefined, home: Home | null): string | null {
  if (!loc?.address) return null;
  if (home && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
    if (distanceM(home, { latitude: loc.latitude, longitude: loc.longitude }) <= HOME_RADIUS_M) return null;
  }
  return placeLabel(loc.address);
}

/** Home is where the wearer spends the most time: the Bee place cluster with the longest dwell. */
export function homeFromClusters(clusters: Array<{ latitude?: number; longitude?: number; total_dwell_ms?: number; visit_count?: number }>): Home | null {
  const best = [...clusters]
    .filter((c) => typeof c.latitude === "number" && typeof c.longitude === "number")
    .sort((a, b) => (b.total_dwell_ms ?? 0) - (a.total_dwell_ms ?? 0))[0];
  if (!best || (best.visit_count ?? 0) < 3) return null;
  return { latitude: best.latitude!, longitude: best.longitude! };
}
