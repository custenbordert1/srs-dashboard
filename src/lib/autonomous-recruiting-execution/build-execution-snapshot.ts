import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyJob } from "@/lib/breezy-api";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import { buildApplicantMonitoring } from "@/lib/autonomous-recruiting-execution/build-applicant-monitoring";
import {
  EXECUTION_HOURS_SAVED_FORMULA,
  buildExecutionOutcomes,
} from "@/lib/autonomous-recruiting-execution/build-execution-outcomes";
import { buildRecruiterExecutionTasks } from "@/lib/autonomous-recruiting-execution/build-recruiter-execution-tasks";
import { buildRefreshRecommendations } from "@/lib/autonomous-recruiting-execution/build-refresh-recommendations";
import {
  listExecutions,
  planExecutionsFromSnapshot,
  type AutopilotExecution,
} from "@/lib/autonomous-recruiting-execution/execution-store";
import {
  listRecruiterTasks,
  upsertRecruiterTasks,
} from "@/lib/autonomous-recruiting-execution/recruiter-task-store";
import type {
  ExecutionAuditLogEntry,
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

function buildExecutionFunnel(executions: AutopilotExecution[]): ExecutionFunnelStep[] {
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
    count: executions.filter((row) => row.status === status).length,
  }));
}

function buildKpis(
  executions: AutopilotExecution[],
  outcomes: ReturnType<typeof buildExecutionOutcomes>,
): ExecutionKpis {
  const recommendationsGenerated = executions.filter((row) => row.status !== "archived").length;
  const approved = executions.filter((row) =>
    ["approved", "executing", "completed"].includes(row.status),
  ).length;
  const inProgress = executions.filter((row) =>
    ["approved", "executing"].includes(row.status),
  ).length;
  const completed = executions.filter((row) => row.status === "completed").length;

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

function buildPostingAutomation(executions: AutopilotExecution[]): PostingAutomationRow[] {
  return executions
    .filter((row) => row.type === "posting" || row.type === "refresh")
    .map((row) => ({
      executionId: row.id,
      title: row.payload.title ?? row.recommendationId,
      territory: row.territory,
      adType: row.payload.adType ?? row.type,
      status: row.status,
      linkedJobDraftId: row.linkedJobDraftId,
      linkedAutomationRunId: row.linkedAutomationRunId,
    }));
}

function buildAuditLog(executions: AutopilotExecution[]): ExecutionAuditLogEntry[] {
  const entries: ExecutionAuditLogEntry[] = [];
  for (const execution of executions) {
    for (const audit of execution.auditTrail) {
      entries.push({
        ...audit,
        executionId: execution.id,
        territory: execution.territory,
        type: execution.type,
      });
    }
  }
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export async function buildExecutionSnapshot(input: {
  autopilotSnapshot: AutonomousRecruitingSnapshot;
  jobs: BreezyJob[];
  scoredRows: ScoredCandidateWorkflowRow[];
  priorCriticalTerritories?: string[];
}): Promise<RecruitingExecutionSnapshot> {
  await planExecutionsFromSnapshot(input.autopilotSnapshot);

  const executions = await listExecutions();
  const activeExecutions = executions.filter((row) => row.status !== "archived");

  const applicantPerformance = buildApplicantMonitoring({
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    scoredRows: input.scoredRows,
    jobs: input.jobs,
    fetchedAt: input.autopilotSnapshot.fetchedAt,
  });

  const { refreshExecutions } = buildRefreshRecommendations({
    postingRecommendations: input.autopilotSnapshot.postingRecommendations,
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    applicantPerformance,
    existingExecutions: activeExecutions,
  });

  const mergedExecutions = [...activeExecutions];
  for (const refresh of refreshExecutions) {
    if (!mergedExecutions.some((row) => row.recommendationId === refresh.recommendationId)) {
      mergedExecutions.push(refresh);
    }
  }

  const recruiterTasksDraft = buildRecruiterExecutionTasks({
    hiringRecommendations: input.autopilotSnapshot.hiringRecommendations,
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    scoredRows: input.scoredRows,
    executions: mergedExecutions,
  });
  await upsertRecruiterTasks(
    recruiterTasksDraft.map(({ createdAt: _c, updatedAt: _u, ...task }) => task),
  );
  const recruiterTaskQueue = await listRecruiterTasks();

  const outcomes = buildExecutionOutcomes({
    executions: mergedExecutions,
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    applicantPerformance,
    priorCriticalTerritories: input.priorCriticalTerritories,
  });

  return {
    fetchedAt: input.autopilotSnapshot.fetchedAt,
    kpis: buildKpis(mergedExecutions, outcomes),
    executionFunnel: buildExecutionFunnel(mergedExecutions),
    executionQueue: mergedExecutions,
    postingAutomation: buildPostingAutomation(mergedExecutions),
    recruiterTaskQueue,
    applicantPerformance,
    auditLog: buildAuditLog(mergedExecutions),
    outcomes,
  };
}
