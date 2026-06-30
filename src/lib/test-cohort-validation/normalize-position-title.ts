const DASH_LIKE = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const MOJIBAKE_DASH = /\u00e2\u0080\u0093|\u00e2\u0080\u0094/g;

export function normalizePositionTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(MOJIBAKE_DASH, "-")
    .replace(DASH_LIKE, "-")
    .replace(/\s+/g, " ");
}

export function positionTitlesMatch(expected: string, actual: string | undefined): boolean {
  if (!actual?.trim()) return false;
  const a = normalizePositionTitle(expected);
  const b = normalizePositionTitle(actual);
  return a === b || a.includes(b) || b.includes(a);
}

export function detectPositionTitleEncodingIssue(
  expected: string,
  actual: string | undefined,
): { hasEncodingMismatch: boolean; detail: string | null } {
  if (!actual?.trim()) {
    return { hasEncodingMismatch: false, detail: null };
  }
  const rawMatch = expected.trim().toLowerCase() === actual.trim().toLowerCase();
  const normalizedMatch = positionTitlesMatch(expected, actual);
  if (!rawMatch && normalizedMatch && /[\u2010-\u2015\u2212]/.test(actual)) {
    return {
      hasEncodingMismatch: true,
      detail: `Store title uses typographic dash — normalized match OK (${actual}).`,
    };
  }
  return { hasEncodingMismatch: false, detail: null };
}
