/** Normalizes a category name to its stored slug: trim, collapse whitespace, lowercase. */
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
