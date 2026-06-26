import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildAutonomousOperationsCenterDashboard } from "@/lib/autonomous-operations-center/build-operations-dashboard";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";

const P75_OPERATIONS_QUERY_IDS = new Set<ExecutiveQueryId>([
  "operations_anything_broken",
  "operations_critical_issues",
  "operations_needs_attention",
  "operations_unhealthy_workflows",
  "operations_recruiting_slowdown",
  "operations_leadership_fix_today",
  "operations_biggest_risk",
  "operations_problem_tomorrow",
]);

export function isP75OperationsQueryId(queryId: ExecutiveQueryId): boolean {
  return P75_OPERATIONS_QUERY_IDS.has(queryId);
}

export function buildP75NlAnswers(input: {
  queryId: ExecutiveQueryId;
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  p75Flags: P75FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt: string;
}): ExecutiveQueryAnswer | null {
  if (!isP75OperationsQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const dashboard = buildAutonomousOperationsCenterDashboard({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    p75Flags: input.p75Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    fetchedAt: input.fetchedAt,
  });

  const sourceSystem = "Autonomous Operations Center (P75)";
  const metrics = dashboard.executiveMetrics;

  switch (input.queryId) {
    case "operations_anything_broken": {
      const broken = dashboard.criticalAlerts.length > 0 || dashboard.systemHealth.status === "critical";
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.criticalAlerts.length,
        metrics: { openIncidents: metrics.openIncidents },
        comparison: null,
        summary: broken
          ? `Yes — ${dashboard.criticalAlerts.length} critical/high alert${dashboard.criticalAlerts.length === 1 ? "" : "s"} detected.`
          : "No critical failures detected in preview monitoring.",
      };
    }
    case "operations_critical_issues": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.criticalIncidents,
        metrics: { critical: metrics.criticalIncidents },
        comparison: null,
        summary:
          metrics.criticalIncidents > 0
            ? `${metrics.criticalIncidents} critical operational issue${metrics.criticalIncidents === 1 ? "" : "s"} open.`
            : "No critical issues open.",
      };
    }
    case "operations_needs_attention": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.openRisks.length,
        metrics: { risks: dashboard.openRisks.length },
        comparison: null,
        summary: dashboard.executiveRecommendations[0] ?? `${dashboard.openRisks.length} items need attention.`,
      };
    }
    case "operations_unhealthy_workflows": {
      const unhealthy = dashboard.workflowHealth.warning + dashboard.workflowHealth.critical;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: unhealthy,
        metrics: { unhealthy, critical: dashboard.workflowHealth.critical },
        comparison: null,
        summary: `${unhealthy} workflow${unhealthy === 1 ? "" : "s"} in warning or critical state.`,
      };
    }
    case "operations_recruiting_slowdown": {
      const blocked = dashboard.automationHealth.blocked;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: blocked,
        metrics: { blocked, queueDepth: dashboard.queueHealth.depth },
        comparison: null,
        summary:
          blocked > 0
            ? `Recruiting slowdown: ${blocked} blocked automations, queue depth ${dashboard.queueHealth.depth}.`
            : "No significant recruiting slowdown detected.",
      };
    }
    case "operations_leadership_fix_today": {
      const top = dashboard.executiveRecommendations[0] ?? "No urgent fixes identified.";
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.executiveRecommendations.length,
        metrics: { recommendations: dashboard.executiveRecommendations.length },
        comparison: null,
        summary: `Leadership priority: ${top}`,
      };
    }
    case "operations_biggest_risk": {
      const top = dashboard.predictiveRisks[0];
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.predictiveRisks.length,
        metrics: { platformHealth: metrics.platformHealth },
        comparison: null,
        summary: top
          ? `Biggest risk: ${top.label} (${top.likelihood} likelihood) — ${top.impact}`
          : `Platform health ${metrics.platformHealth}% with no elevated predictive risks.`,
      };
    }
    case "operations_problem_tomorrow": {
      const tomorrow = dashboard.predictiveRisks.filter((r) => r.likelihood === "high");
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "operations",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: tomorrow.length,
        metrics: { predicted: metrics.predictedIssues },
        comparison: null,
        summary:
          tomorrow.length > 0
            ? `Tomorrow's risk: ${tomorrow[0].label} — ${tomorrow[0].recommendation}`
            : "No high-likelihood problems predicted for tomorrow.",
      };
    }
    default:
      return null;
  }
}
