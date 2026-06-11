import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { AiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center/types";
import { getAiMemorySummary, listAiActionAudit, recordAiRecommendation } from "@/lib/ai-action-engine/ai-action-store";
import { buildCandidateRecoveryList } from "@/lib/ai-action-engine/candidate-recovery-engine";
import { resolveAllInsightActions } from "@/lib/ai-action-engine/resolve-insight-actions";
import { buildTerritoryRecoveryPlans } from "@/lib/ai-action-engine/territory-recovery-plans";
import { evaluateAiWorkflows } from "@/lib/ai-action-engine/workflow-builder";
import type { AiActionCenterSnapshot, ExecutiveActionItem } from "@/lib/ai-action-engine/types";

export type AiActionCenterContext = {
  aiSnapshot: AiCommandCenterSnapshot;
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  fetchedAt: string;
  zeroApplicantJobs?: number;
  followUpsDue?: number;
};

function buildExecutiveActions(
  aiSnapshot: AiCommandCenterSnapshot,
  insightProposals: Record<string, import("@/lib/ai-action-engine/types").AiActionProposal[]>,
): ExecutiveActionItem[] {
  return aiSnapshot.insightsFeed.slice(0, 12).map((insight) => ({
    id: insight.id,
    title: insight.title,
    explanation: insight.explanation,
    priorityScore: insight.score,
    expectedImpact: insightProposals[insight.id]?.[0]?.expectedImpact ?? "Improve territory outcomes",
    proposals: insightProposals[insight.id] ?? [],
  }));
}

export async function buildAiActionCenterSnapshot(ctx: AiActionCenterContext): Promise<AiActionCenterSnapshot> {
  const insightProposals = resolveAllInsightActions(ctx.aiSnapshot.insightsFeed);

  for (const insight of ctx.aiSnapshot.insightsFeed.slice(0, 20)) {
    await recordAiRecommendation({
      insightId: insight.id,
      recommendation: `${insight.title}: ${insight.action}`,
    });
  }

  const maxCoverageRisk = ctx.aiSnapshot.opportunityRisks.reduce(
    (max, row) => Math.max(max, row.overallRiskScore),
    0,
  );

  const triggeredWorkflows = evaluateAiWorkflows({
    coverageRiskScore: maxCoverageRisk,
    zeroApplicantJobs: ctx.zeroApplicantJobs ?? ctx.aiSnapshot.recruiterCoach.jobsNeedingApplicants.length,
    followUpsDue: ctx.followUpsDue ?? ctx.aiSnapshot.recruiterCoach.followUpsDueToday.length,
    snapshot: ctx.aiSnapshot,
  });

  const [recentAudit, memorySummary] = await Promise.all([
    listAiActionAudit(15),
    getAiMemorySummary(),
  ]);

  return {
    fetchedAt: ctx.fetchedAt,
    executiveActions: buildExecutiveActions(ctx.aiSnapshot, insightProposals),
    insightProposals,
    candidateRecovery: buildCandidateRecoveryList({
      candidates: ctx.candidates,
      workflows: ctx.workflows,
      fetchedAt: ctx.fetchedAt,
    }),
    territoryRecoveryPlans: buildTerritoryRecoveryPlans(ctx.aiSnapshot.territoryAdvisor),
    triggeredWorkflows,
    recentAudit,
    memorySummary,
  };
}
