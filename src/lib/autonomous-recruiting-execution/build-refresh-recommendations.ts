import type { RecommendedAd, TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { ApplicantPerformanceRow } from "@/lib/autonomous-recruiting-execution/types";
import type { AutopilotExecution } from "@/lib/autonomous-recruiting-execution/execution-store";
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
  existingExecutions: AutopilotExecution[];
}): { refreshAds: RecommendedAd[]; refreshExecutions: AutopilotExecution[] } {
  const refreshAds: RecommendedAd[] = [];
  const refreshExecutions: AutopilotExecution[] = [];
  const now = new Date().toISOString();

  const refreshCountByTerritory = new Map<string, number>();
  for (const execution of input.existingExecutions) {
    if (execution.type !== "refresh" && execution.payload.adType !== "refresh-ad") continue;
    const count = refreshCountByTerritory.get(execution.territory) ?? 0;
    refreshCountByTerritory.set(execution.territory, count + (execution.payload.refreshCount ?? 1));
  }

  for (const performance of input.applicantPerformance) {
    const needsRefresh =
      performance.alerts.length > 0 &&
      (performance.applicants < performance.targetApplicants ||
        performance.alerts.some((alert) => alert.includes("critical")));

    if (!needsRefresh) continue;

    const coverage = input.coverageNeeds.find((row) => row.territoryKey === performance.territoryKey);
    const existingRefresh = input.postingRecommendations.find(
      (ad) => ad.adType === "refresh-ad" && territoryMatches(ad, coverage ?? { territoryLabel: performance.territoryLabel } as TerritoryCoverageNeed),
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
    const existingExecution = input.existingExecutions.find(
      (row) => row.recommendationId === recommendationId && row.status !== "archived",
    );
    if (existingExecution) {
      refreshExecutions.push(existingExecution);
      continue;
    }

    const execution: AutopilotExecution = {
      id: randomUUID(),
      recommendationId,
      territory: ad.territory,
      type: "refresh",
      priority: "high",
      createdAt: now,
      status: "detected",
      payload: {
        title: ad.title,
        adType: "refresh-ad",
        city: ad.city,
        state: ad.state,
        reason: ad.reason,
        refreshCount,
      },
      auditTrail: [
        {
          id: randomUUID(),
          at: now,
          action: "detected",
          detail: `Refresh signal: applicants below target in ${ad.territory}`,
        },
      ],
    };
    refreshExecutions.push(execution);
  }

  return { refreshAds, refreshExecutions };
}
