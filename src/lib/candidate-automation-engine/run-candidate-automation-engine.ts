import { fetchBreezyJobs } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  DEFAULT_CANDIDATE_AUTOMATION_POLICY,
  loadCandidateAutomationPolicy,
  saveCandidateAutomationPolicy,
} from "@/lib/candidate-automation-engine/automation-policy-store";
import {
  createAutomationRunId,
  recordCandidateAutomationRun,
} from "@/lib/candidate-automation-engine/automation-run-store";
import { buildCandidateAutomationHealth } from "@/lib/candidate-automation-engine/build-automation-health";
import type {
  AutomationRunTrigger,
  CandidateAutomationRunResult,
} from "@/lib/candidate-automation-engine/types";
import { applyCandidateProgressions } from "@/lib/candidate-progression-engine/apply-candidate-progressions";
import { buildCandidateProgressionDecisions } from "@/lib/candidate-progression-engine/build-progression-decision";
import { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion/build-capture-metrics";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { resolveCandidatesForAutomation } from "@/lib/candidate-ingestion/resolve-candidates-for-read";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { applyRecruiterActions } from "@/lib/recruiter-action-engine/apply-recruiter-actions";
import { buildRecruiterActionDecisions } from "@/lib/recruiter-action-engine/build-action-decision";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { runCandidateAutomationExecution } from "@/lib/candidate-automation-execution";
import {
  applyCandidateAdvancements,
  buildCandidateAdvancementDecisions,
} from "@/lib/candidate-advancement-engine";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  loadP84FeatureFlags,
  runAutonomousPaperworkSend,
} from "@/lib/autonomous-paperwork-send-engine";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function policyStepsEnabled(policy: typeof DEFAULT_CANDIDATE_AUTOMATION_POLICY): boolean {
  return (
    policy.assign.enabled ||
    policy.advancement.enabled ||
    policy.actions.enabled ||
    policy.progression.enabled
  );
}

function isAssignedMtdCandidate(
  candidate: { candidateId: string },
  workflows: Record<string, CandidateWorkflowRecord>,
): boolean {
  const workflow = workflows[candidate.candidateId];
  return Boolean(workflow && !isUnassignedRecruiter(workflow.assignedRecruiter));
}

function isProgressionEligible(
  candidate: { candidateId: string },
  workflows: Record<string, CandidateWorkflowRecord>,
): boolean {
  const workflow = workflows[candidate.candidateId];
  if (!workflow) return false;
  return !TERMINAL_STATUSES.has(workflow.workflowStatus);
}

function computeEliminationMetrics(input: {
  mtdTotal: number;
  workflows: Record<string, CandidateWorkflowRecord>;
  mtdCandidates: Array<{ candidateId: string; positionId: string }>;
  jobsByPositionId: Map<string, { jobId: string }>;
}): {
  candidatesAutoAssigned: number;
  candidatesAutoActioned: number;
  candidatesAutoProgressed: number;
  manualInterventionRequired: number;
  automationCompletionPct: number;
} {
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
    const row = buildScoredWorkflowRow(candidate as never, workflow, {
      job: input.jobsByPositionId.get(candidate.positionId) as never,
    });
    const assigned = !isUnassignedRecruiter(row.assignedRecruiter);
    const hasAction = Boolean(row.requiredAction?.trim() && row.actionType !== "none");
    const hasProgression = Boolean(row.recommendedStage?.trim());
    const autoAssigned = assigned && row.recruiterAssignmentSource === "auto";
    const autoAction = hasAction && Boolean(row.actionGeneratedAt);
    const autoProgression = hasProgression && Boolean(row.progressionGeneratedAt);

    if (autoAssigned) candidatesAutoAssigned += 1;
    if (autoAction) candidatesAutoActioned += 1;
    if (autoProgression) candidatesAutoProgressed += 1;

    if (!autoAssigned || !hasAction || !hasProgression) {
      manualInterventionRequired += 1;
    }
  }

  const automationCompletionPct =
    input.mtdTotal > 0
      ? Math.min(
          100,
          Math.round(
            ((candidatesAutoAssigned + candidatesAutoActioned + candidatesAutoProgressed) /
              input.mtdTotal) *
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

export async function runCandidateAutomationEngine(input: {
  trigger: AutomationRunTrigger;
  byUserId?: string;
}): Promise<CandidateAutomationRunResult> {
  const runId = createAutomationRunId();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  const policy = await loadCandidateAutomationPolicy();
  const store = await readIngestionStore();
  const ingested = await resolveCandidatesForAutomation();
  if (!ingested.ok) {
    errors.push(ingested.error);
  }

  const allCandidates = ingested.ok ? ingested.candidates : listIngestedCandidates(store);
  const mtdCandidates = filterMtdCandidates(allCandidates);
  const bundle = await getCandidateWorkflowBundle();
  const workflows = { ...bundle.workflows };
  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));

  let p62Assigned = 0;
  let p63ActionsGenerated = 0;
  let p64ProgressionsGenerated = 0;
  let p83Advanced = 0;
  let p84Sent = 0;
  let p84Failed = 0;
  let p84RetriesScheduled = 0;
  let p84Skipped = 0;
  let p84SignaturesSynced = 0;
  let p84ReadyForMel = 0;
  let skipped = false;
  let skipReason: string | undefined;

  if (policy.paused) {
    skipped = true;
    skipReason = "Automation policy is paused.";
  } else if (policy.mode === "manual" && !policyStepsEnabled(policy)) {
    skipped = true;
    skipReason = "Manual mode — all automation steps disabled.";
  } else if (mtdCandidates.length === 0) {
    skipped = true;
    skipReason = "No MTD candidates in trusted ingestion pool.";
    warnings.push(skipReason);
  } else {
    const candidatesById = new Map(mtdCandidates.map((candidate) => [candidate.candidateId, candidate]));

    if (policy.assign.enabled && policy.mode !== "manual") {
      const assignmentDecisions = buildRecruiterAssignmentDecisions({
        candidates: mtdCandidates,
        workflows,
        rosters: bundle.rosters,
        jobsByPositionId,
      });
      const assignedRecords = await applyRecruiterAssignments({
        decisions: assignmentDecisions,
        candidatesById,
        workflows,
        byUserId: input.byUserId,
      });
      p62Assigned = assignedRecords.length;
    } else if (!policy.assign.enabled) {
      warnings.push("P62 assignment skipped — disabled in policy.");
    }

    if (policy.actions.enabled && policy.mode !== "manual") {
      const assignedMtd = mtdCandidates.filter((candidate) =>
        isAssignedMtdCandidate(candidate, workflows),
      );
      const scoredForActions = assignedMtd.map((candidate) =>
        buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
          job: jobsByPositionId.get(candidate.positionId),
        }),
      );
      const actionDecisions = buildRecruiterActionDecisions(scoredForActions);
      const actionRecords = await applyRecruiterActions({
        decisions: actionDecisions,
        workflows,
        byUserId: input.byUserId,
      });
      p63ActionsGenerated = actionRecords.length;
    } else if (!policy.actions.enabled) {
      warnings.push("P63 actions skipped — disabled in policy.");
    }

    if (policy.progression.enabled && policy.mode !== "manual") {
      const progressionMtd = mtdCandidates.filter((candidate) =>
        isProgressionEligible(candidate, workflows),
      );
      const scoredForProgression = progressionMtd.map((candidate) =>
        buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
          job: jobsByPositionId.get(candidate.positionId),
        }),
      );
      const progressionDecisions = buildCandidateProgressionDecisions(scoredForProgression);
      const progressionRecords = await applyCandidateProgressions({
        decisions: progressionDecisions,
        workflows,
        byUserId: input.byUserId,
      });
      p64ProgressionsGenerated = progressionRecords.length;
    } else if (!policy.progression.enabled) {
      warnings.push("P64 progression skipped — disabled in policy.");
    }

    if (policy.advancement.enabled && policy.mode !== "manual") {
      const onboardingPolicy = await loadCandidateOnboardingPolicy();
      const p84Flags = policy.paperworkSend.enabled ? await loadP84FeatureFlags() : null;
      const advancementMtd = mtdCandidates.filter((candidate) =>
        isAssignedMtdCandidate(candidate, workflows),
      );
      const scoredForAdvancement = advancementMtd.map((candidate) =>
        buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
          job: jobsByPositionId.get(candidate.positionId),
        }),
      );
      const requireAdvancementApproval =
        p84Flags?.liveMode && !p84Flags.requireApproval
          ? false
          : onboardingPolicy.send.requireApproval;
      const advancementDecisions = buildCandidateAdvancementDecisions(scoredForAdvancement, {
        jobsByPositionId,
        paperworkByGrade: onboardingPolicy.paperworkByGrade,
        requireApproval: requireAdvancementApproval,
      });
      const advancementResult = await applyCandidateAdvancements({
        decisions: advancementDecisions,
        workflows,
        byUserId: input.byUserId,
      });
      p83Advanced = advancementResult.advanced;
    } else if (!policy.advancement.enabled) {
      warnings.push("P83 advancement skipped — disabled in policy.");
    }

    if (policy.paperworkSend.enabled && policy.mode !== "manual") {
      const p84Mtd = mtdCandidates.filter((candidate) =>
        isAssignedMtdCandidate(candidate, workflows),
      );
      const scoredForP84 = p84Mtd.map((candidate) =>
        buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
          job: jobsByPositionId.get(candidate.positionId),
        }),
      );
      const onboardingRecords = await listAllCandidateOnboardingRecords();
      const onboardingByCandidateId = new Map(
        onboardingRecords.map((record) => [record.candidateId, record] as const),
      );
      const p84Result = await runAutonomousPaperworkSend({
        candidates: scoredForP84,
        onboardingByCandidateId,
        jobsByPositionId,
        orchestratorRunId: runId,
        byUserId: input.byUserId,
      });
      p84Sent = p84Result.sent;
      p84Failed = p84Result.failed;
      p84RetriesScheduled = p84Result.retriesScheduled;
      p84Skipped = p84Result.skipped;
      p84SignaturesSynced = p84Result.signaturesSynced;
      p84ReadyForMel = p84Result.readyForWork;
      if (p84Result.warnings.length > 0) warnings.push(...p84Result.warnings);
      if (p84Result.errors.length > 0) errors.push(...p84Result.errors);
    } else if (!policy.paperworkSend.enabled) {
      warnings.push("P84 paperwork send skipped — disabled in policy.");
    }

    if (policy.execution.enabled && policy.mode !== "manual") {
      if (policy.paperworkSend.enabled) {
        warnings.push(
          "P65.2 execution paperwork sends skipped — P84 autonomous paperwork send is enabled (avoid duplicates).",
        );
      } else {
      const executionMtd = mtdCandidates.filter((candidate) =>
        isAssignedMtdCandidate(candidate, workflows),
      );
      const scoredForExecution = executionMtd.map((candidate) =>
        buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
          job: jobsByPositionId.get(candidate.positionId),
        }),
      );
      const execution = await runCandidateAutomationExecution({
        candidates: scoredForExecution,
        orchestratorRunId: runId,
        automationMode: policy.mode,
        byUserId: input.byUserId,
      });
      if (execution.warnings.length > 0) warnings.push(...execution.warnings);
      if (execution.errors.length > 0) errors.push(...execution.errors);
      }
    } else if (!policy.execution.enabled) {
      warnings.push("P65.2 execution skipped — disabled in policy.");
    }
  }

  const captureHealth = buildApplicantCaptureHealth({
    store,
    workflows,
    jobsByPositionId,
    rosters: bundle.rosters,
  });

  const elimination = computeEliminationMetrics({
    mtdTotal: mtdCandidates.length,
    workflows,
    mtdCandidates,
    jobsByPositionId,
  });

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;
  const ok = errors.length === 0;

  const runRecord = {
    runId,
    trigger: input.trigger,
    startedAt,
    completedAt,
    durationMs,
    ok,
    skipped,
    skipReason,
    mtdCandidatesProcessed: mtdCandidates.length,
    p62Assigned,
    p63ActionsGenerated,
    p64ProgressionsGenerated,
    p83Advanced,
    p84Sent,
    p84Failed,
    p84RetriesScheduled,
    p84Skipped,
    p84SignaturesSynced,
    p84ReadyForMel,
    p62CoveragePct: captureHealth.p62CoveragePct,
    p63CoveragePct: captureHealth.p63CoveragePct,
    p64CoveragePct: captureHealth.p64CoveragePct,
    ...elimination,
    errors,
    warnings,
  };

  await recordCandidateAutomationRun(runRecord);
  await saveCandidateAutomationPolicy({ ...policy, lastRunAt: completedAt });

  const health = await buildCandidateAutomationHealth({ workflows, store, jobsByPositionId, rosters: bundle.rosters });

  return {
    ok,
    skipped,
    skipReason,
    runId,
    trigger: input.trigger,
    durationMs,
    mtdCandidatesProcessed: mtdCandidates.length,
    p62Assigned,
    p63ActionsGenerated,
    p64ProgressionsGenerated,
    p83Advanced,
    p84Sent,
    p84Failed,
    p84RetriesScheduled,
    p84Skipped,
    p84SignaturesSynced,
    p84ReadyForMel,
    p62CoveragePct: captureHealth.p62CoveragePct,
    p63CoveragePct: captureHealth.p63CoveragePct,
    p64CoveragePct: captureHealth.p64CoveragePct,
    health,
    errors,
    warnings,
  };
}
