import type { BreezyJob } from "@/lib/breezy-api";
import { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion/build-capture-metrics";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import { listCandidateAutomationRuns } from "@/lib/candidate-automation-engine/automation-run-store";
import { loadCandidateAutomationPolicy } from "@/lib/candidate-automation-engine/automation-policy-store";
import type { CandidateAutomationHealth } from "@/lib/candidate-automation-engine/types";
import { buildCandidateExecutionHealth } from "@/lib/candidate-automation-execution/build-execution-health";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates } from "@/lib/candidate-ingestion/ingestion-store";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function eliminationFromWorkflows(input: {
  mtdCandidates: ReturnType<typeof listIngestedCandidates>;
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
}): Pick<
  CandidateAutomationHealth,
  | "candidatesAutoAssigned"
  | "candidatesAutoActioned"
  | "candidatesAutoProgressed"
  | "manualInterventionRequired"
  | "automationCompletionPct"
> {
  let candidatesAutoAssigned = 0;
  let candidatesAutoActioned = 0;
  let candidatesAutoProgressed = 0;
  let manualInterventionRequired = 0;

  for (const candidate of input.mtdCandidates) {
    const workflow = input.workflows[candidate.candidateId];
    if (!workflow) {
      manualInterventionRequired += 1;
      continue;
    }
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: input.jobsByPositionId.get(candidate.positionId),
    });
    const autoAssigned = !isUnassignedRecruiter(row.assignedRecruiter) && row.recruiterAssignmentSource === "auto";
    const hasAction = Boolean(row.requiredAction?.trim() && row.actionType !== "none");
    const hasProgression = Boolean(row.recommendedStage?.trim());

    if (autoAssigned) candidatesAutoAssigned += 1;
    if (hasAction && row.actionGeneratedAt) candidatesAutoActioned += 1;
    if (hasProgression && row.progressionGeneratedAt) candidatesAutoProgressed += 1;

    if (!autoAssigned || !hasAction || !hasProgression) {
      manualInterventionRequired += 1;
    }
  }

  const mtdTotal = input.mtdCandidates.length;
  const automationCompletionPct =
    mtdTotal > 0
      ? Math.min(
          100,
          Math.round(
            ((candidatesAutoAssigned + candidatesAutoActioned + candidatesAutoProgressed) / mtdTotal) *
              100,
          ),
        )
      : 100;

  return {
    candidatesAutoAssigned,
    candidatesAutoActioned,
    candidatesAutoProgressed,
    manualInterventionRequired,
    automationCompletionPct,
  };
}

export async function buildCandidateAutomationHealth(input: {
  store: CandidateIngestionStoreFile;
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  rosters?: RecruiterRosters;
}): Promise<CandidateAutomationHealth> {
  const [policy, runs, executionHealth] = await Promise.all([
    loadCandidateAutomationPolicy(),
    listCandidateAutomationRuns(50),
    buildCandidateExecutionHealth(),
  ]);

  const captureHealth = buildApplicantCaptureHealth({
    store: input.store,
    workflows: input.workflows,
    jobsByPositionId: input.jobsByPositionId,
    rosters: input.rosters,
  });

  const mtdCandidates = filterMtdCandidates(listIngestedCandidates(input.store));
  const elimination = eliminationFromWorkflows({
    mtdCandidates,
    workflows: input.workflows,
    jobsByPositionId: input.jobsByPositionId,
  });

  const completedRuns = runs.filter((run) => !run.skipped);
  const successfulRuns = completedRuns.filter((run) => run.ok);
  const failedRuns = completedRuns.filter((run) => !run.ok).length;
  const lastRun = runs[0] ?? null;

  return {
    lastRunAt: lastRun?.completedAt ?? policy.lastRunAt ?? null,
    lastTrigger: lastRun?.trigger ?? null,
    lastRunOk: lastRun ? lastRun.ok : null,
    policyMode: policy.mode,
    policyPaused: policy.paused,
    runSuccessRatePct:
      completedRuns.length > 0
        ? Math.round((successfulRuns.length / completedRuns.length) * 100)
        : 100,
    failedRuns,
    totalRuns: runs.length,
    mtdCandidatesProcessed: lastRun?.mtdCandidatesProcessed ?? mtdCandidates.length,
    p62CoveragePct: captureHealth.p62CoveragePct,
    p63CoveragePct: captureHealth.p63CoveragePct,
    p64CoveragePct: captureHealth.p64CoveragePct,
    ...elimination,
    autoExecutions: executionHealth.completedExecutions,
    escalations: executionHealth.escalationsCreated,
    rebalances: 0,
  };
}
