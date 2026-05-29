import type { PrismaClient } from "@prisma/client";

export type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type LocationInput = {
  zipcode?: string;
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;
};

type ResolveLocationOk = { ok: true; postalCodeId: string | null };
type ResolveLocationErr = { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Resolve the FK to PostalCode for a form submission. Shared by the technician
 * and dispatch-visit forms (both collect a zipcode + optional city/state/country).
 * - Empty zipcode → unsets the relation (postalCodeId: null).
 * - Existing zipcode → reuses the master row.
 * - New zipcode → requires city/state/country and creates the master row.
 */
export async function resolvePostalCodeId(
  tx: TxClient,
  input: LocationInput,
): Promise<ResolveLocationOk | ResolveLocationErr> {
  const zipcode = input.zipcode?.trim();
  if (!zipcode) return { ok: true, postalCodeId: null };

  const existing = await tx.postalCode.findUnique({ where: { zipcode } });
  if (existing) return { ok: true, postalCodeId: existing.id };

  const city = input.locationCity?.trim();
  const state = input.locationState?.trim();
  const country = input.locationCountry?.trim();
  const missing: Record<string, string[]> = {};
  if (!city) missing.locationCity = ["City is required for a new zipcode"];
  if (!state) missing.locationState = ["State is required for a new zipcode"];
  if (!country) missing.locationCountry = ["Country is required for a new zipcode"];
  if (Object.keys(missing).length > 0) return { ok: false, fieldErrors: missing };

  const created = await tx.postalCode.create({
    data: { zipcode, city: city!, state: state!, country: country! },
  });
  return { ok: true, postalCodeId: created.id };
}
