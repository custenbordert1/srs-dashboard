import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadAutopilotState } from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import { classifyCandidatesSince } from "@/lib/p154-full-candidate-backfill-continuous-processing/classify-candidates";
import { buildP1547AutopilotStatus } from "@/lib/p154-continuous-autonomous-recruiting-runner/build-autopilot-status";
import {
  getP154IntervalMinutes,
  getP154MaxAssignmentsPerCycle,
  getP154MaxPaperworkSendsPerCycle,
  getP154BackfillSinceDate,
  isP154ContinuousEnabled,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import type {
  P155OperationsDashboard,
  P155RunnerDisplayStatus,
} from "@/lib/p155-autopilot-operations-dashboard/types";
import { P155_SOURCE_PHASE } from "@/lib/p155-autopilot-operations-dashboard/types";

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

export async function buildP155OperationsDashboard(): Promise<P155OperationsDashboard> {
  const generatedAt = new Date().toISOString();
  const [p1547, runner, autopilot, classification] = await Promise.all([
    buildP1547AutopilotStatus(),
    loadP1547RunnerState(),
    loadAutopilotState(),
    classifyCandidatesSince({ backfillSince: getP154BackfillSinceDate(), maxRows: 0 }),
  ]);

  const signedToday = p1547.todaysSignatures;
  const activeSignatures = await countActiveSignatures();
  const queueRemaining = p1547.currentQueue || (await countQueueDepth());

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
    queue: {
      eligibleForPaperwork: classification.buckets.eligible_for_paperwork,
      waitingOnSignature:
        classification.buckets.active_signature_request + classification.buckets.already_sent,
      signedToday,
      invalidEmail: classification.buckets.invalid_email,
      duplicateCandidates: classification.buckets.duplicate,
      manualReview: classification.buckets.manual_review,
      disqualifiedArchived: classification.buckets.disqualified_archived,
      needsRecruiterAssignment: classification.buckets.needs_recruiter_assignment,
      queueRemaining,
    },
  };
}
