import type { P170SearchQuery } from "@/lib/p170-unified-candidate-discovery/types";

/** Breezy candidate/position ids are 12+ hex characters. */
const BREEZY_ID_PATTERN = /^[a-f0-9]{12,}$/i;

export function normalizePhoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

/**
 * Parse a raw recruiter search term into a structured query.
 * A single hex token is treated as BOTH a candidate id and a position id
 * (the store matcher tries either) since the two share the same format.
 */
export function parseP170SearchQuery(raw: string): P170SearchQuery {
  const trimmed = raw.trim();
  const base: P170SearchQuery = {
    raw: trimmed,
    name: null,
    email: null,
    phone: null,
    candidateId: null,
    positionId: null,
  };

  if (!trimmed) return base;

  if (trimmed.includes("@")) {
    return { ...base, email: trimmed.toLowerCase() };
  }

  if (BREEZY_ID_PATTERN.test(trimmed)) {
    return { ...base, candidateId: trimmed.toLowerCase(), positionId: trimmed.toLowerCase() };
  }

  const digits = normalizePhoneDigits(trimmed);
  const isMostlyDigits = digits.length >= 7 && digits.length / trimmed.replace(/\s+/g, "").length >= 0.7;
  if (isMostlyDigits) {
    return { ...base, phone: digits };
  }

  return { ...base, name: trimmed };
}
