import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildAutonomousDecisionEngineDashboard } from "@/lib/autonomous-decision-engine/decision-dashboard";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";

const P76_DECISION_QUERY_IDS = new Set<ExecutiveQueryId>([
  "decisions_what_next",
  "decisions_best",
  "decisions_why_recommended",
  "decisions_need_approval",
  "decisions_high_confidence",
  "decisions_low_confidence",
  "decisions_safest_action",
  "decisions_highest_value",
]);

export function isP76DecisionQueryId(queryId: ExecutiveQueryId): boolean {
  return P76_DECISION_QUERY_IDS.has(queryId);
}

export function buildP76NlAnswers(input: {
  queryId: ExecutiveQueryId;
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  p75Flags: P75FeatureFlags;
  p76Flags: P76FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt: string;
}): ExecutiveQueryAnswer | null {
  if (!isP76DecisionQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const dashboard = buildAutonomousDecisionEngineDashboard({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    p75Flags: input.p75Flags,
    p76Flags: input.p76Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    fetchedAt: input.fetchedAt,
  });

  const sourceSystem = "Autonomous Decision Engine (P76)";
  const metrics = dashboard.executiveMetrics;
  const top = dashboard.recommendedDecisions[0];

  switch (input.queryId) {
    case "decisions_what_next": {
      const next = dashboard.recommendedDecisions.slice(0, 3).map((d) => d.decision).join("; ");
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.recommendedDecisions.length,
        metrics: { total: metrics.totalDecisions },
        comparison: null,
        summary: next
          ? `Top recommendations: ${next}`
          : "No autonomous decisions generated in preview.",
      };
    }
    case "decisions_best": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: top ? 1 : 0,
        metrics: { confidence: top?.confidence ?? 0 },
        comparison: null,
        summary: top
          ? `Best decision: ${top.decision} (${top.confidence}% confidence, ${top.requiredEngine}).`
          : "No ranked decisions available.",
      };
    }
    case "decisions_why_recommended": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: top ? 1 : 0,
        metrics: { confidence: top?.confidence ?? 0 },
        comparison: null,
        summary: top
          ? top.executiveExplanation
          : "No recommendation to explain — run decision engine preview first.",
      };
    }
    case "decisions_need_approval": {
      const count = dashboard.humanApprovalRequired.length;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: count,
        metrics: { humanReview: metrics.humanReviewDecisions },
        comparison: null,
        summary:
          count > 0
            ? `${count} decision${count === 1 ? "" : "s"} require human approval before any future execution.`
            : "No decisions currently flagged for human approval.",
      };
    }
    case "decisions_high_confidence": {
      const count = dashboard.highConfidenceDecisions.length;
      const sample = dashboard.highConfidenceDecisions[0]?.decision;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: count,
        metrics: { automationReady: metrics.automationReadyDecisions },
        comparison: null,
        summary:
          count > 0
            ? `${count} high-confidence action${count === 1 ? "" : "s"}${sample ? ` — e.g. ${sample}` : ""}.`
            : "No high-confidence autonomous actions in preview.",
      };
    }
    case "decisions_low_confidence": {
      const count = dashboard.lowConfidenceDecisions.length;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: count,
        metrics: { averageConfidence: metrics.averageConfidence ?? 0 },
        comparison: null,
        summary:
          count > 0
            ? `${count} low-confidence recommendation${count === 1 ? "" : "s"} — review before acting.`
            : "No low-confidence recommendations flagged.",
      };
    }
    case "decisions_safest_action": {
      const safest = [...dashboard.recommendedDecisions]
        .filter((d) => !d.blocked && d.risk === "low")
        .sort((a, b) => b.confidence - a.confidence)[0];
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: safest ? 1 : 0,
        metrics: { riskScore: metrics.averageRiskScore ?? 0 },
        comparison: null,
        summary: safest
          ? `Safest action: ${safest.decision} (${safest.confidence}% confidence, low risk).`
          : "No low-risk autonomous actions identified.",
      };
    }
    case "decisions_highest_value": {
      const value = dashboard.topOpportunities[0];
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "decisions",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.topOpportunities.length,
        metrics: { hoursSaved: Math.round(metrics.recruiterHoursSaved * 10) },
        comparison: null,
        summary: value
          ? `Highest-value: ${value.decision} — saves ~${value.estimatedRecruiterTimeSavedMinutes} recruiter minutes.`
          : metrics.highestValueRecommendation ?? "No high-value opportunities ranked.",
      };
    }
    default:
      return null;
  }
}
