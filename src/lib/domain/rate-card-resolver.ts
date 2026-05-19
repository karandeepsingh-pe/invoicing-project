import type { RateCard, TechType } from "@prisma/client";

// A RateCard is active for `on` when:
//   effectiveFrom <= on  AND  (effectiveTo IS NULL OR on < effectiveTo)
// (effectiveTo is exclusive — matches how billing windows are normally read.)
export function isActive(card: Pick<RateCard, "effectiveFrom" | "effectiveTo">, on: Date): boolean {
  const onMs = on.getTime();
  if (card.effectiveFrom.getTime() > onMs) return false;
  if (card.effectiveTo && card.effectiveTo.getTime() <= onMs) return false;
  return true;
}

export function filterActiveForTechType<T extends Pick<RateCard, "techType" | "effectiveFrom" | "effectiveTo">>(
  cards: T[],
  techType: TechType,
  on: Date,
): T[] {
  return cards.filter((c) => c.techType === techType && isActive(c, on));
}
