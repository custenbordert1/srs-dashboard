import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildAutonomousRecruitingOrchestratorDashboard } from "@/lib/autonomous-recruiting-orchestrator/build-orchestrator-dashboard";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";

const P74_ORCHESTRATOR_QUERY_IDS = new Set<ExecutiveQueryId>([
  "orchestrator_system_status",
  "orchestrator_automation_blocked",
  "orchestrator_engine_waiting",
  "orchestrator_candidates_stuck",
  "orchestrator_today_workflow",
  "orchestrator_hiring_blockers",
  "orchestrator_next_actions",
  "orchestrator_recruiter_automated",
  "orchestrator_workflow_attention",
]);

export function isP74OrchestratorQueryId(queryId: ExecutiveQueryId): boolean {
  return P74_ORCHESTRATOR_QUERY_IDS.has(queryId);
}

export function buildP74NlAnswers(input: {
  queryId: ExecutiveQueryId;
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt: string;
}): ExecutiveQueryAnswer | null {
  if (!isP74OrchestratorQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const dashboard = buildAutonomousRecruitingOrchestratorDashboard({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    fetchedAt: input.fetchedAt,
  });

  const sourceSystem = "Autonomous Recruiting Orchestrator (P74)";
  const metrics = dashboard.executiveMetrics;
  const readiness = dashboard.readinessScore;

  switch (input.queryId) {
    case "orchestrator_system_status": {
      const waiting = dashboard.engineHealth.filter((e) => e.status === "warning" || e.status === "blocked");
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.workflowHealth.total,
        metrics: { healthy: dashboard.workflowHealth.healthy, readiness: readiness.overall },
        comparison: null,
        summary: `Orchestrator preview: ${dashboard.workflowHealth.healthy} healthy workflows, readiness ${readiness.overall}%. ${waiting.length} engine${waiting.length === 1 ? "" : "s"} need attention.`,
      };
    }
    case "orchestrator_automation_blocked": {
      const blocked = dashboard.blockedCandidates.length;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: blocked,
        metrics: { blocked: metrics.blockedWorkflows },
        comparison: null,
        summary: blocked > 0 ? `${blocked} workflows blocked from automation.` : "No workflows currently blocked.",
      };
    }
    case "orchestrator_engine_waiting": {
      const waiting = dashboard.engineHealth.filter((e) => e.status !== "healthy");
      const names = waiting.map((e) => e.label).join(", ");
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: waiting.length,
        metrics: { engines: waiting.length },
        comparison: null,
        summary: waiting.length > 0 ? `Waiting engines: ${names}.` : "All engines healthy in preview.",
      };
    }
    case "orchestrator_candidates_stuck": {
      const stuck = dashboard.waitingHumanAction.length + dashboard.blockedCandidates.length;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: stuck,
        metrics: { stuck },
        comparison: null,
        summary: `${stuck} candidate${stuck === 1 ? "" : "s"} stuck or awaiting human action.`,
      };
    }
    case "orchestrator_today_workflow": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.candidatesEnteringWorkflow,
        metrics: { entering: metrics.candidatesEnteringWorkflow, completions: metrics.workflowCompletions },
        comparison: null,
        summary: `Today: ${metrics.candidatesEnteringWorkflow} entering workflow, ${metrics.workflowCompletions} completed, ${metrics.candidatesAwaitingAction} awaiting action.`,
      };
    }
    case "orchestrator_hiring_blockers": {
      const topBlocker = dashboard.blockedCandidates[0]?.blockers[0] ?? readiness.improvements[0] ?? "None identified";
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.blockedWorkflows,
        metrics: { blocked: metrics.blockedWorkflows },
        comparison: null,
        summary: `Top hiring blocker: ${topBlocker}. Readiness: ${readiness.overall}%.`,
      };
    }
    case "orchestrator_next_actions": {
      const next = dashboard.upcomingAutomations[0];
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.upcomingAutomations.length,
        metrics: { upcoming: dashboard.upcomingAutomations.length },
        comparison: null,
        summary: next
          ? `Next: ${next.action} for ${next.candidateName} via ${next.engine}.`
          : "No upcoming automations scheduled in preview.",
      };
    }
    case "orchestrator_recruiter_automated": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.recruiterTimeSaved,
        metrics: { timeSaved: metrics.recruiterTimeSaved, automationPercent: dashboard.automationProgress.percent ?? 0 },
        comparison: null,
        summary: `${metrics.recruiterTimeSaved} recruiter actions automated in preview (${dashboard.automationProgress.percent ?? 0}% automation progress).`,
      };
    }
    case "orchestrator_workflow_attention": {
      const attention = dashboard.waitingHumanAction[0];
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "orchestrator",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.waitingHumanAction.length,
        metrics: { needsAttention: dashboard.waitingHumanAction.length },
        comparison: null,
        summary: attention
          ? `Focus: ${attention.candidateName} — ${attention.nextAction}.`
          : "No workflows need immediate attention.",
      };
    }
    default:
      return null;
  }
}
