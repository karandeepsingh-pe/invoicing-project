"use server";

import { requireAdmin } from "@/lib/auth/dev-session";

export type GeocodeZipHit = {
  city: string;
  stateName: string;
  stateAbbr: string;
};

type ZippopotamPlace = {
  "place name"?: string;
  state?: string;
  "state abbreviation"?: string;
};

type ZippopotamResponse = {
  places?: ZippopotamPlace[];
};

/**
 * Enrich a zipcode into city + state via the free Zippopotam.us API
 * (no key, ~60 countries). Used as a fallback when a zipcode is not in the
 * PostalCode master so the technician/dispatch forms can auto-fill location.
 *
 * Returns null on any failure (unknown zip → 404, network error, empty body)
 * — the caller treats null as "couldn't auto-detect, fall back to manual".
 * Never throws to the client.
 */
export async function geocodeZip(
  countryIso2: string,
  zipcode: string,
): Promise<GeocodeZipHit | null> {
  await requireAdmin();
  const country = countryIso2.trim().toLowerCase();
  const zip = zipcode.trim();
  if (country.length === 0 || zip.length < 4) return null;

  try {
    const res = await fetch(
      `https://api.zippopotam.us/${encodeURIComponent(country)}/${encodeURIComponent(zip)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ZippopotamResponse;
    const place = data.places?.[0];
    if (!place) return null;
    const city = place["place name"]?.trim() ?? "";
    const stateName = place.state?.trim() ?? "";
    const stateAbbr = place["state abbreviation"]?.trim() ?? "";
    if (city.length === 0 && stateName.length === 0) return null;
    return { city, stateName, stateAbbr };
  } catch {
    return null;
  }
}
