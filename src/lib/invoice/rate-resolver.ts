// Thin wrapper over the domain rate-resolver. Adds an optional SLA-code
// filter so per-type calculators can pick the right rate row when multiple
// rows share a (category, band) tuple but differ on slaId.

import type { RateCategory } from "@prisma/client";
import {
  isActiveOn,
  type RateWithSubCat,
} from "@/lib/domain/account-rate-resolver";

export type RateWithSla<TSub = { rateCategory: RateCategory }, TSla = { code: string }> =
  RateWithSubCat<TSub> & { sla: TSla };

export function ratesFor<R extends RateWithSla>(args: {
  rates: R[];
  category: RateCategory;
  band: number;
  on: Date;
  slaCode?: string;
}): R[] {
  return args.rates.filter(
    (r) =>
      r.rateSubCategory.rateCategory === args.category &&
      r.band === args.band &&
      isActiveOn(r, args.on) &&
      (args.slaCode === undefined || r.sla.code === args.slaCode),
  );
}

export function pickRate<R extends RateWithSla>(args: {
  rates: R[];
  category: RateCategory;
  band: number;
  on: Date;
  slaCode?: string;
  subCategoryCode: string;
}): R | undefined {
  return ratesFor(args).find(
    (r) =>
      (r as unknown as { rateSubCategory: { code: string } }).rateSubCategory.code ===
      args.subCategoryCode,
  );
}
