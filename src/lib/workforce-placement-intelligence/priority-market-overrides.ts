import type { PriorityMarketOverride } from "@/lib/workforce-placement-intelligence/types";

function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildMarketKey(city: string, state: string): string {
  return `${normalizeCity(city)}|${state.trim().toUpperCase()}`;
}

export function formatMarketLabel(city: string, state: string): string {
  const title = city
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return `${title}, ${state.trim().toUpperCase()}`;
}

/**
 * Preview-only leadership overrides — never persisted to production stores.
 */
export const PREVIEW_PRIORITY_MARKET_OVERRIDES: PriorityMarketOverride[] = [
  {
    marketKey: buildMarketKey("Houston", "TX"),
    marketLabel: "Houston, TX",
    level: "critical",
    reason: "Large Client Launch",
    expiresAt: "2026-07-05T23:59:59.000Z",
    scoreBoost: 25,
    previewOnly: true,
  },
  {
    marketKey: buildMarketKey("Cincinnati", "OH"),
    marketLabel: "Cincinnati, OH",
    level: "elevated",
    reason: "Staffing shortage across multiple banners",
    expiresAt: "2026-08-01T23:59:59.000Z",
    scoreBoost: 15,
    previewOnly: true,
  },
];

export function listActivePriorityMarketOverrides(referenceMs = Date.now()): PriorityMarketOverride[] {
  return PREVIEW_PRIORITY_MARKET_OVERRIDES.filter(
    (row) => Date.parse(row.expiresAt) >= referenceMs,
  );
}

export function resolvePriorityOverride(
  marketKey: string,
  referenceMs = Date.now(),
): PriorityMarketOverride | null {
  return (
    listActivePriorityMarketOverrides(referenceMs).find((row) => row.marketKey === marketKey) ?? null
  );
}
