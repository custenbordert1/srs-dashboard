import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import {
  buildJobPostingAutopilotRecommendations,
  buildProjectAutopilotRecommendations,
  buildRecruiterAutopilotRecommendations,
  buildStoreClusterAutopilotRecommendations,
  buildTerritoryAutopilotRecommendations,
} from "@/lib/recruiting-autopilot/build-autopilot-recommendations";
import { aggregateExpectedOutcomes } from "@/lib/recruiting-autopilot/opportunity-scoring";
import {
  groupRecommendationsByKey,
  sortAutopilotRecommendations,
} from "@/lib/recruiting-autopilot/prioritize-recommendations";
import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildTerritoryActionCenterSnapshot } from "@/lib/territory-action-engine";
import { buildWorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";

export type BuildRecruitingAutopilotInput = {
  bundle: RecruitingIntelligenceRouteBundle;
  alerts?: ExecutiveAlert[];
  followUps?: ExecutiveAlertFollowUp[];
};

export function buildRecruitingAutopilotSnapshot(
  input: BuildRecruitingAutopilotInput,
): RecruitingAutopilotSnapshot {
  const { bundle } = input;
  const alerts = input.alerts ?? buildAlertSnapshot({ bundle }).alerts;
  const followUps = input.followUps ?? [];

  const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle,
    alerts,
    followUps,
  });

  const workforce = buildWorkforceOpsCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
  });

  const actionCenter = buildTerritoryActionCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
    workforceQueue: workforce.operationsQueue,
  });

  const raw = [
    ...buildTerritoryAutopilotRecommendations(riskSnapshot.territories),
    ...buildProjectAutopilotRecommendations(riskSnapshot.projects),
    ...buildStoreClusterAutopilotRecommendations(riskSnapshot.storeClusters),
    ...buildJobPostingAutopilotRecommendations({
      jobs: bundle.jobs,
      candidates: bundle.candidates,
    }),
    ...buildRecruiterAutopilotRecommendations(actionCenter.recruiterWorkloads),
  ];

  const deduped = new Map<string, (typeof raw)[number]>();
  for (const row of raw) {
    const prior = deduped.get(row.id);
    if (!prior || row.prioritizationScore > prior.prioritizationScore) {
      deduped.set(row.id, row);
    }
  }

  const all = sortAutopilotRecommendations([...deduped.values()]);
  const topActionsToday = all.slice(0, 10);

  return {
    generatedAt: bundle.fetchedAt,
    executiveSummary: {
      topActionsToday,
      ...aggregateExpectedOutcomes(topActionsToday.map((row) => row.opportunity)),
    },
    highestImpact: all.slice(0, 25),
    quickWins: all.filter((row) => row.horizon === "quick-win").slice(0, 25),
    longTerm: all.filter((row) => row.horizon === "long-term").slice(0, 25),
    byTerritory: groupRecommendationsByKey(
      all.filter((row) => row.entityType === "territory" || row.entityType === "store-cluster"),
      (row) => row.dmName ?? row.entityLabel,
    ),
    byProject: groupRecommendationsByKey(
      all.filter((row) => row.entityType === "project"),
      (row) => row.entityLabel,
    ),
    byDm: groupRecommendationsByKey(
      all.filter((row) => row.dmName),
      (row) => row.dmName!,
    ),
    all,
    trustByType: {},
  };
}
