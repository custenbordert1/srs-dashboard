import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyJob } from "@/lib/breezy-api";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import { buildApplicantMonitoring } from "@/lib/autonomous-recruiting-execution/build-applicant-monitoring";
import { buildExecutionAuditView } from "@/lib/autonomous-recruiting-execution/build-execution-audit-view";
import {
  EXECUTION_HOURS_SAVED_FORMULA,
  buildExecutionOutcomes,
} from "@/lib/autonomous-recruiting-execution/build-execution-outcomes";
import { buildRecruiterTaskView } from "@/lib/autonomous-recruiting-execution/build-recruiter-task-view";
import { buildRefreshRecommendations } from "@/lib/autonomous-recruiting-execution/build-refresh-recommendations";
import {
  listCorrelations,
  planCorrelationsFromSnapshot,
  upsertCorrelations,
  type ExecutionCorrelation,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type {
  ExecutionFunnelStep,
  ExecutionKpis,
  PostingAutomationRow,
  RecruitingExecutionSnapshot,
} from "@/lib/autonomous-recruiting-execution/types";

const FUNNEL_LABELS: Record<string, string> = {
  detected: "Detected",
  recommended: "Recommended",
  approved: "Approved",
  executing: "In progress",
  completed: "Completed",
  failed: "Failed",
  archived: "Archived",
};

function buildExecutionFunnel(correlations: ExecutionCorrelation[]): ExecutionFunnelStep[] {
  const statuses = [
    "detected",
    "recommended",
    "approved",
    "executing",
    "completed",
    "failed",
    "archived",
  ] as const;

  return statuses.map((status) => ({
    id: status,
    label: FUNNEL_LABELS[status] ?? status,
    count: correlations.filter((row) => row.status === status).length,
  }));
}

function buildKpis(
  correlations: ExecutionCorrelation[],
  outcomes: ReturnType<typeof buildExecutionOutcomes>,
): ExecutionKpis {
  const recommendationsGenerated = correlations.filter((row) => row.status !== "archived").length;
  const approved = correlations.filter((row) =>
    ["approved", "executing", "completed"].includes(row.status),
  ).length;
  const inProgress = correlations.filter((row) =>
    ["approved", "executing"].includes(row.status),
  ).length;
  const completed = correlations.filter((row) => row.status === "completed").length;

  const postingSuccess = outcomes.find((row) => row.id === "posting-success-rate");
  const applicantConversion = outcomes.find((row) => row.id === "applicant-conversion");
  const timeSaved = outcomes.find((row) => row.id === "time-saved");
  const coverageRisk = outcomes.find((row) => row.id === "coverage-risk-reduction");

  return {
    recommendationsGenerated,
    approved,
    inProgress,
    completed,
    postingSuccessRate: typeof postingSuccess?.value === "number" ? postingSuccess.value : 0,
    applicantConversionRate:
      typeof applicantConversion?.value === "number" ? applicantConversion.value : 0,
    timeSaved: typeof timeSaved?.value === "number" ? timeSaved.value : 0,
    coverageRiskReduction: typeof coverageRisk?.value === "number" ? coverageRisk.value : 0,
    hoursSavedFormula: EXECUTION_HOURS_SAVED_FORMULA,
  };
}

function buildPostingAutomation(correlations: ExecutionCorrelation[]): PostingAutomationRow[] {
  return correlations
    .filter((row) => row.type === "posting" || row.type === "refresh")
    .map((row) => ({
      executionId: row.id,
      title: row.displayTitle ?? row.recommendationId,
      territory: row.territory,
      adType: row.adType ?? row.type,
      status: row.status,
      linkedJobDraftId: row.jobDraftId,
      linkedAutomationRunId: row.automationRunId,
    }));
}

export async function buildExecutionSnapshot(input: {
  autopilotSnapshot: AutonomousRecruitingSnapshot;
  jobs: BreezyJob[];
  scoredRows: ScoredCandidateWorkflowRow[];
  priorCriticalTerritories?: string[];
}): Promise<RecruitingExecutionSnapshot> {
  await planCorrelationsFromSnapshot(input.autopilotSnapshot);

  const correlations = await listCorrelations();
  const activeCorrelations = correlations.filter((row) => row.status !== "archived");

  const applicantPerformance = buildApplicantMonitoring({
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    scoredRows: input.scoredRows,
    jobs: input.jobs,
    fetchedAt: input.autopilotSnapshot.fetchedAt,
  });

  const { refreshCorrelations } = buildRefreshRecommendations({
    postingRecommendations: input.autopilotSnapshot.postingRecommendations,
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    applicantPerformance,
    existingCorrelations: activeCorrelations,
  });

  await upsertCorrelations(refreshCorrelations);

  const mergedCorrelations = await listCorrelations();
  const activeMerged = mergedCorrelations.filter((row) => row.status !== "archived");

  const recruiterTaskQueue = buildRecruiterTaskView({
    scoredRows: input.scoredRows,
    referenceMs: new Date(input.autopilotSnapshot.fetchedAt).getTime(),
  });

  const outcomes = buildExecutionOutcomes({
    correlations: activeMerged,
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    applicantPerformance,
    priorCriticalTerritories: input.priorCriticalTerritories,
  });

  const auditLog = await buildExecutionAuditView(activeMerged);

  return {
    fetchedAt: input.autopilotSnapshot.fetchedAt,
    kpis: buildKpis(activeMerged, outcomes),
    executionFunnel: buildExecutionFunnel(activeMerged),
    executionQueue: activeMerged,
    postingAutomation: buildPostingAutomation(activeMerged),
    recruiterTaskQueue,
    applicantPerformance,
    auditLog,
    outcomes,
  };
}
