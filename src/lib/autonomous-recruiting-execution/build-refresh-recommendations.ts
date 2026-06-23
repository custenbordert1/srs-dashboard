import type { RecommendedAd, TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { ApplicantPerformanceRow } from "@/lib/autonomous-recruiting-execution/types";
import { randomUUID } from "node:crypto";

function territoryMatches(ad: RecommendedAd, coverage: TerritoryCoverageNeed): boolean {
  return (
    ad.territory === coverage.territoryLabel ||
    ad.state === coverage.states[0] ||
    ad.territory.includes(coverage.dmName)
  );
}

export function buildRefreshRecommendations(input: {
  postingRecommendations: RecommendedAd[];
  coverageNeeds: TerritoryCoverageNeed[];
  applicantPerformance: ApplicantPerformanceRow[];
  existingCorrelations: ExecutionCorrelation[];
}): { refreshAds: RecommendedAd[]; refreshCorrelations: ExecutionCorrelation[] } {
  const refreshAds: RecommendedAd[] = [];
  const refreshCorrelations: ExecutionCorrelation[] = [];
  const now = new Date().toISOString();

  const refreshCountByTerritory = new Map<string, number>();
  for (const correlation of input.existingCorrelations) {
    if (correlation.type !== "refresh" && correlation.adType !== "refresh-ad") continue;
    const count = refreshCountByTerritory.get(correlation.territory) ?? 0;
    refreshCountByTerritory.set(
      correlation.territory,
      count + (correlation.refreshCount ?? 1),
    );
  }

  for (const performance of input.applicantPerformance) {
    const needsRefresh =
      performance.alerts.length > 0 &&
      (performance.applicants < performance.targetApplicants ||
        performance.alerts.some((alert) => alert.includes("critical")));

    if (!needsRefresh) continue;

    const coverage = input.coverageNeeds.find((row) => row.territoryKey === performance.territoryKey);
    const existingRefresh = input.postingRecommendations.find(
      (ad) =>
        ad.adType === "refresh-ad" &&
        territoryMatches(
          ad,
          coverage ?? ({ territoryLabel: performance.territoryLabel } as TerritoryCoverageNeed),
        ),
    );

    const refreshCount = (refreshCountByTerritory.get(performance.territoryLabel) ?? 0) + 1;
    const ad: RecommendedAd = existingRefresh ?? {
      id: `refresh-${performance.territoryKey}-${refreshCount}`,
      title: `Refresh posting — ${performance.territoryLabel}`,
      city: "",
      state: coverage?.states[0] ?? "",
      territory: performance.territoryLabel,
      reason: `Applicants (${performance.applicants}) below target (${performance.targetApplicants}) or coverage critical.`,
      expectedApplicants: { min: 2, max: 6 },
      priority: "high",
      approvalStatus: "pending",
      adType: "refresh-ad",
    };

    refreshAds.push(ad);

    const recommendationId = ad.id;
    const existingCorrelation = input.existingCorrelations.find(
      (row) => row.recommendationId === recommendationId && row.status !== "archived",
    );
    if (existingCorrelation) {
      refreshCorrelations.push(existingCorrelation);
      continue;
    }

    refreshCorrelations.push({
      id: randomUUID(),
      recommendationId,
      territory: ad.territory,
      type: "refresh",
      priority: "high",
      createdAt: now,
      status: "detected",
      displayTitle: ad.title,
      adType: "refresh-ad",
      city: ad.city,
      state: ad.state,
      reason: ad.reason,
      refreshCount,
    });
  }

  return { refreshAds, refreshCorrelations };
}
