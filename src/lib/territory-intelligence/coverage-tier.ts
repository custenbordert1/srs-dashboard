export type CoverageHealthTier = "green" | "yellow" | "red";

/** Coverage / territory health tier thresholds (percent). */
export const TERRITORY_COVERAGE_THRESHOLD = 50;

export function resolveCoverageHealthTier(coveragePercent: number): CoverageHealthTier {
  if (coveragePercent >= 80) return "green";
  if (coveragePercent >= TERRITORY_COVERAGE_THRESHOLD) return "yellow";
  return "red";
}
