import { prisma } from "@/lib/db";

/**
 * Gazetted public-holiday dates falling inside [start, end), from the global
 * Holiday master. Feeds `businessDaysInRange` so Dedicated/Project billing
 * excludes public holidays from the business-day denominator.
 */
export async function holidayDatesInRange(range: {
  start: Date;
  end: Date;
}): Promise<Date[]> {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: range.start, lt: range.end } },
    select: { date: true },
    orderBy: { date: "asc" },
  });
  return holidays.map((h) => h.date);
}
