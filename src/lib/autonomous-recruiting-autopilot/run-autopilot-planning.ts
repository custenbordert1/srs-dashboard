import { buildAutopilotSnapshot } from "@/lib/autonomous-recruiting-engine/build-autopilot-snapshot";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import {
  evaluateApprovalRules,
  findMatchingApprovalRule,
} from "@/lib/autonomous-recruiting-engine/approval-rules";
import { recordRuleTrigger } from "@/lib/autonomous-recruiting-engine/approval-rules-store";
import {
  buildExecutionSnapshot,
  executeCorrelation,
  listCorrelations,
  planCorrelationsFromSnapshot,
} from "@/lib/autonomous-recruiting-execution";
import type { RecruitingExecutionSnapshot } from "@/lib/autonomous-recruiting-execution";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";
import {
  approveCorrelationWithP59Accountability,
  recordP59ExecutionOutcome,
} from "@/lib/autonomous-recruiting-autopilot/bridge-p59-accountability";
import {
  createAutopilotRunId,
  loadAutopilotPolicy,
  recordAutopilotRun,
} from "@/lib/autonomous-recruiting-autopilot/autopilot-policy-store";
import { buildAndPersistRecommendationFeedback } from "@/lib/autonomous-recruiting-autopilot/build-recommendation-feedback";
import type {
  AutopilotPlanningResult,
  AutopilotPolicy,
  AutopilotRunEntry,
  RecommendationFeedbackIndex,
} from "@/lib/autonomous-recruiting-autopilot/types";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

export type AutopilotPlanningContext = {
  jobs: BreezyJob[];
  candidates: import("@/lib/breezy-api").BreezyCandidate[];
  workflows: import("@/lib/candidate-workflow-types").CandidateWorkflowState;
  opportunities: import("@/lib/mel-matching/matching-engine-types").MelOpportunity[];
  scoredRows: ScoredCandidateWorkflowRow[];
  fetchedAt: string;
  territoryStates?: string[];
  approvalRules: import("@/lib/autonomous-recruiting-engine/types").ApprovalRule[];
  automationRuns: import("@/lib/hiring-automation-engine/types").ControlCenterSnapshot;
  feedbackIndex?: RecommendationFeedbackIndex;
  pipelineSnapshot?: PipelineIntelligenceSnapshot;
};

export { evaluateApprovalRules };

export function resolveAutopilotAutonomy(policy: AutopilotPolicy): {
  shouldAutoApprove: boolean;
  shouldAutoExecute: boolean;
} {
  const shouldAutoApprove =
    !policy.paused && (policy.mode === "semi-automatic" || policy.mode === "automatic");
  return {
    shouldAutoApprove,
    shouldAutoExecute: shouldAutoApprove && policy.mode === "automatic",
  };
}

export async function executeEligibleRecommendations(input: {
  snapshot: AutonomousRecruitingSnapshot;
  autoExecute: boolean;
}): Promise<{ executed: number; failed: number; errors: string[] }> {
  if (!input.autoExecute) return { executed: 0, failed: 0, errors: [] };

  const correlations = await listCorrelations();
  const autoApprovedIds = new Set(
    input.snapshot.postingRecommendations
      .filter((ad) => ad.approvalStatus === "auto-approved")
      .map((ad) => ad.id),
  );

  let executed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const correlation of correlations) {
    if (!autoApprovedIds.has(correlation.recommendationId)) continue;
    if (correlation.status !== "approved") continue;
    if (correlation.type !== "posting" && correlation.type !== "refresh") continue;

    const result = await executeCorrelation(correlation.id, "P59 Autopilot (system)");
    const accountabilityId = result.correlation?.accountabilityActionId ?? correlation.accountabilityActionId;
    if (result.ok) {
      executed += 1;
      if (accountabilityId) {
        await recordP59ExecutionOutcome(accountabilityId, result.summary, true);
      }
    } else {
      failed += 1;
      errors.push(result.error);
      if (accountabilityId) {
        await recordP59ExecutionOutcome(accountabilityId, result.error, false);
      }
    }
  }

  return { executed, failed, errors };
}

export async function runAutopilotPlanning(
  ctx: AutopilotPlanningContext,
): Promise<AutopilotPlanningResult> {
  const startedAt = new Date().toISOString();
  const policy = await loadAutopilotPolicy();
  const runId = createAutopilotRunId();

  const snapshot = buildAutopilotSnapshot({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    workflows: ctx.workflows,
    opportunities: ctx.opportunities,
    scoredRows: ctx.scoredRows,
    fetchedAt: ctx.fetchedAt,
    territoryStates: ctx.territoryStates,
    approvalRules: ctx.approvalRules,
    automationRuns: ctx.automationRuns,
    feedbackIndex: ctx.feedbackIndex,
  });

  await planCorrelationsFromSnapshot(snapshot);

  const applicantCountByTerritory = new Map(
    snapshot.coverageNeeds.map((row) => [row.territoryKey, row.applicantCount]),
  );
  const ruleEvaluation = evaluateApprovalRules(
    snapshot.postingRecommendations.map((ad) =>
      ad.approvalStatus === "auto-approved" ? ad : { ...ad, approvalStatus: "pending" as const },
    ),
    ctx.approvalRules,
    { coverageNeeds: snapshot.coverageNeeds, applicantCountByTerritory },
  );

  for (const ruleId of [...new Set(ruleEvaluation.matchedRuleIds)]) {
    await recordRuleTrigger(ruleId, true);
  }

  const evaluatedSnapshot: AutonomousRecruitingSnapshot = {
    ...snapshot,
    postingRecommendations: ruleEvaluation.ads,
  };

  let autoApproved = 0;
  const matchedRuleIds = [...new Set(ruleEvaluation.matchedRuleIds)];
  const errors: string[] = [];

  const { shouldAutoApprove, shouldAutoExecute } = resolveAutopilotAutonomy(policy);

  if (shouldAutoApprove) {
    const correlations = await listCorrelations();
    for (const ad of evaluatedSnapshot.postingRecommendations) {
      if (ad.approvalStatus !== "auto-approved") continue;

      const rule = findMatchingApprovalRule(ad, ctx.approvalRules, snapshot.coverageNeeds);
      if (!rule) continue;

      const correlation = correlations.find(
        (row) => row.recommendationId === ad.id && row.status !== "archived",
      );
      if (!correlation || !["detected", "recommended"].includes(correlation.status)) continue;

      const approved = await approveCorrelationWithP59Accountability(
        correlation.id,
        rule.id,
        rule.name,
      );
      if (approved) autoApproved += 1;
    }
  }

  const executionResult = await executeEligibleRecommendations({
    snapshot: evaluatedSnapshot,
    autoExecute: shouldAutoExecute,
  });
  errors.push(...executionResult.errors);

  const executionSnapshot: RecruitingExecutionSnapshot = await buildExecutionSnapshot({
    autopilotSnapshot: evaluatedSnapshot,
    jobs: ctx.jobs,
    scoredRows: ctx.scoredRows,
  });

  await buildAndPersistRecommendationFeedback({
    correlations: executionSnapshot.executionQueue,
    applicantPerformance: executionSnapshot.applicantPerformance,
    pipelineSnapshot: ctx.pipelineSnapshot,
    fetchedAt: ctx.fetchedAt,
  });

  const completedAt = new Date().toISOString();
  const run: AutopilotRunEntry = {
    id: runId,
    startedAt,
    completedAt,
    mode: policy.mode,
    paused: policy.paused,
    recommendationsPlanned: executionSnapshot.executionQueue.length,
    autoApproved,
    executed: executionResult.executed,
    failed: executionResult.failed,
    matchedRuleIds,
    errors,
  };

  await recordAutopilotRun(run);

  return {
    run,
    snapshot: evaluatedSnapshot,
    executionSnapshot,
    pipelineSnapshot: ctx.pipelineSnapshot,
  };
}
