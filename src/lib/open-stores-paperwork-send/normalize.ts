import { normalizeStateCode } from "@/lib/dm-territory-map";

/**
 * Collapse mojibake + Unicode punctuation so Excel / Breezy titles match reliably.
 * Handles en/em dashes, curly quotes, and common UTF-8→Latin-1 corruption (‚Äì etc.).
 */
export function sanitizeSpecialChars(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    // Common mojibake for en-dash / quotes when workbook was saved with wrong encoding
    .replace(/‚Äì|â€“|â€”/g, "–")
    .replace(/‚Äô|â€™/g, "'")
    .replace(/‚Äú|‚Äù|â€œ|â€/g, '"')
    .replace(/Ã¢â‚¬â€œ/g, "–")
    // Unicode dashes → ASCII hyphen for matching keys
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    // Curly / fancy quotes → ASCII
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeText(value: string): string {
  return sanitizeSpecialChars(value).toLowerCase();
}

export function normalizePositionKey(value: string): string {
  return normalizeText(value).replace(/[—–-]+/g, "-");
}

export function cellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return sanitizeSpecialChars(String(value));
}

export function cellNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function isApplicantYes(value: unknown): boolean {
  const raw = cellString(value).toLowerCase();
  return raw === "yes" || raw === "y" || raw === "true" || raw === "1";
}

/** Prefer 2-letter codes; fall back to dm-territory-map helper. */
export function normalizeState(raw: string): string {
  const trimmed = cellString(raw).toUpperCase();
  if (!trimmed) return "";
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  const mapped = normalizeStateCode(trimmed);
  return mapped.length === 2 ? mapped : trimmed.slice(0, 2);
}

export function normalizeCity(raw: string): string {
  return normalizeText(raw)
    .replace(/\./g, "")
    .replace(/\bst\b/g, "saint")
    .replace(/\bft\b/g, "fort")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCityState(location: string): { city: string; state: string } {
  const parts = cellString(location)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { city: "", state: "" };
  if (parts.length === 1) {
    const maybeState = normalizeState(parts[0]!);
    if (/^[A-Z]{2}$/.test(maybeState) && parts[0]!.length <= 2) {
      return { city: "", state: maybeState };
    }
    return { city: normalizeCity(parts[0]!), state: "" };
  }
  const state = normalizeState(parts[parts.length - 1]!);
  const city = normalizeCity(parts.slice(0, -1).join(", "));
  return { city, state };
}

/**
 * Extract city/state hint from a Breezy position title.
 * Examples: "Retail Merchandiser – Oak Grove, KY" → Oak Grove / KY
 */
export function cityStateFromPositionName(name: string): { city: string; state: string } {
  const cleaned = sanitizeSpecialChars(name).replace(/\s+-\s+/g, " – ");
  // Split on en/em dash or spaced hyphen after sanitize (dashes may already be "-")
  const dashParts = cleaned.split(/\s+[–—-]\s+/);
  const tail = dashParts.length > 1 ? dashParts[dashParts.length - 1]! : cleaned;
  if (tail.includes(",")) return parseCityState(tail);
  const m = tail.match(/^(.+?)\s+([A-Za-z]{2})\s*$/);
  if (m) return { city: normalizeCity(m[1]!), state: normalizeState(m[2]!) };
  return { city: normalizeCity(tail), state: "" };
}

export function citiesCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Token-overlap / prefix fuzzy score for city names (0–1).
 * Exact = 1; substring / shared tokens scale down; unrelated ≈ 0.
 */
export function fuzzyCityScore(aRaw: string, bRaw: string): number {
  const a = normalizeCity(aRaw);
  const b = normalizeCity(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.55 + 0.35 * (shorter / longer);
  }

  // Soft full-string prefix (e.g. "sheboygan fall" vs "sheboygan falls")
  if (a.startsWith(b) || b.startsWith(a)) {
    return 0.7 + 0.25 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
  }

  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const stem = (t: string) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t);
  const setA = new Set(tokensA.map(stem));
  const setB = new Set(tokensB.map(stem));
  let overlap = 0;
  for (const t of setA) {
    if (setB.has(t)) overlap += 1;
  }
  if (overlap === 0) return 0;
  const union = new Set([...setA, ...setB]).size;
  return Math.min(0.95, overlap / union);
}

/** Sheet applicant count with Breezy Candidates fallback. */
export function effectiveApplicantCount(input: {
  applicantCount?: number;
  breezyCandidates?: number;
}): number {
  const sheet = Math.max(0, input.applicantCount ?? 0);
  if (sheet > 0) return sheet;
  return Math.max(0, input.breezyCandidates ?? 0);
}
