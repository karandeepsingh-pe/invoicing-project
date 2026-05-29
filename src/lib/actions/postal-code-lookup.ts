"use server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";

export type PostalCodeLookupHit = {
  id: string;
  zipcode: string;
  city: string;
  state: string;
  country: string;
};

export async function lookupPostalCode(
  zipcode: string,
): Promise<PostalCodeLookupHit | null> {
  await requireAdmin();
  const trimmed = zipcode.trim();
  if (trimmed.length === 0) return null;
  const row = await prisma.postalCode.findUnique({
    where: { zipcode: trimmed },
    select: { id: true, zipcode: true, city: true, state: true, country: true },
  });
  return row;
}
