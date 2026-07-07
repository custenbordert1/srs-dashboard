import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadAutopilotState } from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import { classifyCandidatesSince } from "@/lib/p154-full-candidate-backfill-continuous-processing/classify-candidates";
import type { P1544ClassificationReport } from "@/lib/p154-full-candidate-backfill-continuous-processing/types";
import { buildP1547AutopilotStatus } from "@/lib/p154-continuous-autonomous-recruiting-runner/build-autopilot-status";
import {
  getP154BackfillSinceDate,
  getP154IntervalMinutes,
  getP154MaxAssignmentsPerCycle,
  getP154MaxPaperworkSendsPerCycle,
  isP154ContinuousEnabled,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import { buildQueueHealthFromWorkflow } from "@/lib/p155-autopilot-operations-dashboard/build-queue-health-fast";
import { P155_SERVER_CLASSIFICATION_TIMEOUT_MS } from "@/lib/p155-autopilot-operations-dashboard/constants";
import { withServerTimeout } from "@/lib/p155-autopilot-operations-dashboard/request-timeout";
import type {
  P155OperationsDashboard,
  P155RunnerDisplayStatus,
} from "@/lib/p155-autopilot-operations-dashboard/types";
import { P155_SOURCE_PHASE } from "@/lib/p155-autopilot-operations-dashboard/types";

function emptyClassification(backfillSince: string): P1544ClassificationReport {
  return {
    backfillSince,
    totalClassified: 0,
    buckets: {
      eligible_for_paperwork: 0,
      already_sent: 0,
      active_signature_request: 0,
      already_signed: 0,
      duplicate: 0,
      invalid_email: 0,
      disqualified_archived: 0,
      needs_recruiter_assignment: 0,
      manual_review: 0,
      do_not_send: 0,
    },
    rows: [],
  };
}

function resolveRunnerDisplayStatus(input: {
  continuousEnabled: boolean;
  autopilotEnabled: boolean;
  schedulerMode: string;
  currentStatus: string;
  paused: boolean;
}): P155RunnerDisplayStatus {
  if (input.paused || input.schedulerMode === "paused") return "paused";
  if (input.currentStatus === "error") return "error";
  if (input.currentStatus === "running") return "running";
  if (!input.autopilotEnabled && !input.continuousEnabled) return "disabled";
  return "idle";
}

async function countActiveSignatures(): Promise<number> {
  const bundle = await getCandidateWorkflowBundle();
  return Object.values(bundle.workflows).filter(
    (r) =>
      r.signatureRequestId &&
      (r.paperworkStatus === "sent" ||
        r.paperworkStatus === "viewed" ||
        r.workflowStatus === "Paperwork Sent"),
  ).length;
}

async function countQueueDepth(): Promise<number> {
  const bundle = await getCandidateWorkflowBundle();
  return Object.values(bundle.workflows).filter(
    (r) =>
      !isUnassignedRecruiter(r.assignedRecruiter) &&
      r.paperworkStatus !== "signed" &&
      r.paperworkStatus !== "sent" &&
      !["Not Qualified", "Active Rep", "Loaded in MEL"].includes(r.workflowStatus),
  ).length;
}

export type P155DashboardBuildResult = {
  dashboard: P155OperationsDashboard;
  warnings: string[];
};

export async function buildP155OperationsDashboard(): Promise<P155DashboardBuildResult> {
  const generatedAt = new Date().toISOString();
  const backfillSince = getP154BackfillSinceDate();
  const warnings: string[] = [];

  const [p1547, runner, autopilot] = await Promise.all([
    buildP1547AutopilotStatus(),
    loadP1547RunnerState(),
    loadAutopilotState(),
  ]);

  const classificationResult = await withServerTimeout({
    label: "P155 candidate classification",
    promise: classifyCandidatesSince({ backfillSince, maxRows: 0 }),
    timeoutMs: P155_SERVER_CLASSIFICATION_TIMEOUT_MS,
    fallback: emptyClassification(backfillSince),
  });

  let queue = await buildQueueHealthFromWorkflow();

  if (classificationResult.timedOut || classificationResult.error) {
    warnings.push(
      classificationResult.error ??
        "Queue classification timed out — showing workflow snapshot instead of full Breezy classification.",
    );
    queue = {
      ...queue,
      queueRemaining: p1547.currentQueue || queue.queueRemaining,
    };
  } else {
    const classification = classificationResult.value;
    queue = {
      eligibleForPaperwork: classification.buckets.eligible_for_paperwork,
      waitingOnSignature:
        classification.buckets.active_signature_request + classification.buckets.already_sent,
      signedToday: p1547.todaysSignatures,
      invalidEmail: classification.buckets.invalid_email,
      duplicateCandidates: classification.buckets.duplicate,
      manualReview: classification.buckets.manual_review,
      disqualifiedArchived: classification.buckets.disqualified_archived,
      needsRecruiterAssignment: classification.buckets.needs_recruiter_assignment,
      queueRemaining: p1547.currentQueue || (await countQueueDepth()),
    };
  }

  const signedToday = p1547.todaysSignatures;
  const activeSignatures = await countActiveSignatures();
  const lastCycle = p1547.lastCycle;
  const candidatesEvaluated = Math.max(
    runner.candidatesEvaluated,
    autopilot.dashboard.candidatesEvaluated,
    lastCycle?.candidatesEvaluated ?? 0,
  );
  const recruitersAssigned = Math.max(
    runner.assigned,
    autopilot.dashboard.recruitersAssigned,
    lastCycle?.assigned ?? 0,
  );
  const duplicatesPrevented = Math.max(
    runner.duplicatesPrevented,
    autopilot.dashboard.duplicatesPrevented,
    lastCycle?.duplicatesPrevented ?? 0,
  );
  const failures = Math.max(runner.errors, autopilot.dashboard.failures, lastCycle?.errors ?? 0);

  const autopilotEnabled = isP154ControlledProductionAutopilotEnabled();
  const continuousEnabled = isP154ContinuousEnabled();

  return {
    warnings,
    dashboard: {
      sourcePhase: P155_SOURCE_PHASE,
      generatedAt,
      status: {
        enabled: autopilotEnabled,
        continuousEnabled,
        runnerStatus: resolveRunnerDisplayStatus({
          continuousEnabled,
          autopilotEnabled,
          schedulerMode: runner.schedulerMode,
          currentStatus: runner.currentStatus,
          paused: autopilot.paused,
        }),
        lastRunAt: runner.lastRun ?? autopilot.lastCycleAt,
        nextRunAt: runner.nextRun,
        uptimeMs: p1547.uptimeMs,
        serverStartTime: p1547.serverStartTime,
        intervalMinutes: getP154IntervalMinutes(),
        maxSendsPerCycle: getP154MaxPaperworkSendsPerCycle(),
        maxAssignmentsPerCycle: getP154MaxAssignmentsPerCycle(),
        processingLockHeld: runner.processingLock !== null,
        lastError: runner.lastError ?? autopilot.lastError,
      },
      today: {
        candidatesEvaluated,
        recruitersAssigned,
        paperworkSent: p1547.todaysSends,
        paperworkSigned: signedToday,
        activeSignatureRequests: activeSignatures,
        duplicatesPrevented,
        failures,
      },
      queue,
    },
  };
}
