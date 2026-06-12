/**
 * Case-insensitive multi-token matcher for client-side list filtering.
 * The query is split on whitespace; every token must appear as a substring
 * of the haystack ("jo sm" matches "John Smith"). No diacritic folding.
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = haystack.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/**
 * Filters items by text. Returns the input array reference unchanged when the
 * query is blank so memoized consumers keep referential stability.
 */
export function filterByText<T>(
  items: readonly T[],
  query: string,
  getText: (item: T) => string,
): readonly T[] {
  if (query.trim() === "") return items;
  return items.filter((item) => matchesQuery(getText(item), query));
}
