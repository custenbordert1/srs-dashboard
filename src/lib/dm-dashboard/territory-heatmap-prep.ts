import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { buildTerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
import { cityKey, countBuckets } from "@/lib/dm-dashboard/territory-shared";

/**
 * Backend payload for future map visualization (lat/lng enrichment via geocoder later).
 */
export type TerritoryHeatmapCell = {
  state: string;
  city: string;
  /** Placeholder for geocoding pipeline — null until MEL/map service wired. */
  lat: number | null;
  lng: number | null;
  jobCount: number;
  candidateCount: number;
  healthScore: number;
  /** Open roles per applicant — higher = more opportunity density. */
  opportunityDensity: number;
  /** Inverse health + aging pressure — higher = hotter risk zone. */
  riskScore: number;
};

export type TerritoryHeatmapPayload = {
  version: 1;
  fetchedAt: string;
  territoryLabel: string;
  cells: TerritoryHeatmapCell[];
  meta: {
    cellCount: number;
    avgHealthScore: number;
    maxOpportunityDensity: number;
  };
};

export function buildTerritoryHeatmapPayload(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
  territoryLabel: string,
): TerritoryHeatmapPayload {
  const health = buildTerritoryHealthScore(jobs, candidates, fetchedAt);
  const jobsByCity = countBuckets(
    jobs.map((j) => ({ label: cityKey(j.city, j.state) })),
    (r) => r.label,
    64,
  );
  const candidatesByCity = new Map(
    countBuckets(
      candidates.map((c) => ({ label: cityKey(c.city, c.state) })),
      (r) => r.label,
      64,
    ).map((r) => [r.label, r.value]),
  );

  const cells: TerritoryHeatmapCell[] = jobsByCity.map((row) => {
    const [cityPart, statePart] = row.label.split(",").map((s) => s.trim());
    const candidateCount = candidatesByCity.get(row.label) ?? 0;
    const opportunityDensity =
      candidateCount > 0 ? Math.round((row.value / candidateCount) * 100) / 100 : row.value;
    const riskScore = Math.min(
      100,
      Math.round(100 - health.score + row.value * 2 - candidateCount),
    );

    return {
      state: normalizeStateCode(statePart ?? "") || statePart || "—",
      city: cityPart || "Unknown",
      lat: null,
      lng: null,
      jobCount: row.value,
      candidateCount,
      healthScore: health.score,
      opportunityDensity,
      riskScore: Math.max(0, riskScore),
    };
  });

  const avgHealthScore =
    cells.length > 0
      ? Math.round(cells.reduce((sum, c) => sum + c.healthScore, 0) / cells.length)
      : health.score;

  return {
    version: 1,
    fetchedAt,
    territoryLabel,
    cells,
    meta: {
      cellCount: cells.length,
      avgHealthScore,
      maxOpportunityDensity: Math.max(0, ...cells.map((c) => c.opportunityDensity)),
    },
  };
}
