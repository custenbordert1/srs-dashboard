import type { AuthSession } from "@/lib/auth/types";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { assignRecruiters } from "@/lib/p151-autonomous-recruiter-assignment/assign-recruiters";
import { advanceCandidatePipeline } from "@/lib/p151-autonomous-candidate-advancement/advance-candidate-pipeline";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { executeImmediatePaperworkPolicy } from "@/lib/p152-immediate-paperwork-policy/execute-immediate-paperwork-policy";
import {
  defaultAutopilotEnabledFeatures,
  loadAutopilotState,
  saveAutopilotState,
} from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import type {
  AutopilotDashboardMetrics,
  ControlledProductionAutopilotCycleReport,
} from "@/lib/p154-controlled-production-autopilot-activation/types";
import {
  P154_DEFAULT_MAX_ASSIGNMENTS,
  P154_DEFAULT_MAX_SENDS,
  P154_SOURCE_PHASE,
} from "@/lib/p154-controlled-production-autopilot-activation/types";
import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";

export function isP154ControlledProductionAutopilotEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED === "true";
}

export function getP154MaxAssignmentsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P154_DEFAULT_MAX_ASSIGNMENTS;
}

export function getP154MaxSendsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P154_DEFAULT_MAX_SENDS;
}

function applyAutopilotEnvFlags(env: NodeJS.ProcessEnv, live: boolean): void {
  if (live) {
    env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED = "true";
    env.P151_AUTONOMOUS_ADVANCEMENT_ENABLED = "true";
    env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
  }
  env.P151_MAX_ASSIGNMENTS_PER_CYCLE = String(getP154MaxAssignmentsPerCycle(env));
  env.P152_MAX_SENDS_PER_CYCLE = String(getP154MaxSendsPerCycle(env));
}

function buildRollbackRecommendation(report: ControlledProductionAutopilotCycleReport): string {
  if (report.paused || report.cycle.failures > 0 || report.cycle.stoppedOnError) {
    return "Autopilot paused with automation flags left enabled. Set P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED=false after root-cause review.";
  }
  if (report.cycle.paperworkSent > 0) {
    return "Monitor Dropbox Sign and audit logs for 24h before raising P154_MAX_PAPERWORK_SENDS_PER_CYCLE.";
  }
  if (report.dryRun) {
    return "Dry run complete — enable with P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED=true and --live after executive review.";
  }
  return "Controlled production cycle complete. Autopilot remains active for continuous ingestion.";
}

async function countWebhookCompletionsSince(referenceMs: number): Promise<number> {
  const bundle = await getCandidateWorkflowBundle();
  let signed = 0;
  for (const record of Object.values(bundle.workflows)) {
    if (record.paperworkStatus === "signed" && record.paperworkSignedAt) {
      if (Date.parse(record.paperworkSignedAt) >= referenceMs) signed += 1;
    }
  }
  return signed;
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

export async function executeControlledProductionAutopilot(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
  sendQueue?: import("@/lib/p181-scoped-operator-paperwork-queue/types").PaperworkSendQueueInput;
}): Promise<ControlledProductionAutopilotCycleReport> {
  const started = Date.now();
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);
  const p154Enabled = isP154ControlledProductionAutopilotEnabled();
  const dryRun = input.dryRun ?? !p154Enabled;
  const liveExecution = p154Enabled && !dryRun;
  const maxAssignments = getP154MaxAssignmentsPerCycle();
  const maxSends = getP154MaxSendsPerCycle();
  const enabledFeatures = defaultAutopilotEnabledFeatures();

  const health = await verifyAutopilotSystemHealth();
  const priorState = await loadAutopilotState();

  if (!health.healthy) {
    const aborted: ControlledProductionAutopilotCycleReport = {
      sourcePhase: P154_SOURCE_PHASE,
      generatedAt,
      dryRun: true,
      autopilotEnabled: false,
      paused: true,
      pausedReason: health.abortReason,
      health,
      enabledFeatures,
      limits: {
        maxRecruiterAssignmentsPerCycle: maxAssignments,
        maxPaperworkSendsPerCycle: maxSends,
        stopOnFirstError: true,
      },
      cycle: {
        candidatesEvaluated: 0,
        recruitersAssigned: 0,
        paperworkSent: 0,
        paperworkSkipped: 0,
        duplicatesPrevented: 0,
        failures: 0,
        executionTimeMs: Date.now() - started,
        webhookStatus: "not_run",
        queueRemaining: 0,
        stoppedOnError: true,
        capReachedAssignments: false,
        capReachedSends: false,
        sentCandidateIds: [],
      },
      dashboard: priorState.dashboard,
      safetyFlags: {
        breezyWrites: false,
        breezyStageMovement: false,
        executeBatchCalled: false,
        duplicatePreventionActive: true,
        auditLoggingEnabled: true,
      },
      rollbackRecommendation:
        "System health check failed — autopilot not activated. Resolve unhealthy dependencies before retry.",
      sentCandidateIds: [],
    };
    await saveAutopilotState({
      ...priorState,
      autopilotStatus: "paused",
      paused: true,
      pausedReason: health.abortReason,
      lastError: health.abortReason,
      lastCycleAt: generatedAt,
    });
    return aborted;
  }

  applyAutopilotEnvFlags(process.env, liveExecution);

  let candidatesEvaluated = 0;
  let recruitersAssigned = 0;
  let paperworkSent = 0;
  let paperworkSkipped = 0;
  let duplicatesPrevented = 0;
  let failures = 0;
  let stoppedOnError = false;
  let capReachedAssignments = false;
  let capReachedSends = false;
  let sentCandidateIds: string[] = [];
  let pausedReason: string | null = null;

  try {
    const ingestion = await resolveCandidatesForRead({ scanMode: "preview", force: true });
    if (ingestion.ok) {
      candidatesEvaluated = ingestion.candidates.length;
    }

    if (enabledFeatures.p151RecruiterAssignment) {
      const assignment = await assignRecruiters({
        session: input.session,
        dryRun: !liveExecution,
        userId: input.userId ?? input.session.userId,
      });
      recruitersAssigned = assignment.assignmentsCompleted;
      candidatesEvaluated = Math.max(candidatesEvaluated, assignment.candidatesEvaluated);
      failures += assignment.assignmentsFailed;
      stoppedOnError = stoppedOnError || assignment.stoppedOnError;
      capReachedAssignments = assignment.capReached;
      if (assignment.stoppedOnError) {
        pausedReason = assignment.rollbackRecommendation;
      }
    }

    if (!stoppedOnError && enabledFeatures.automaticWorkflowAdvancement) {
      const advancement = await advanceCandidatePipeline({
        session: input.session,
        dryRun: !liveExecution,
        userId: input.userId ?? input.session.userId,
      });
      candidatesEvaluated = Math.max(candidatesEvaluated, advancement.candidatesEvaluated);
      failures += advancement.failures;
      stoppedOnError = stoppedOnError || advancement.stoppedOnError;
      if (advancement.stoppedOnError) {
        pausedReason = advancement.rollbackRecommendation;
      }
    }

    if (!stoppedOnError && enabledFeatures.p152ImmediatePaperwork) {
      const paperwork = await executeImmediatePaperworkPolicy({
        session: input.session,
        dryRun: !liveExecution,
        userId: input.userId ?? input.session.userId,
        userEmail: input.session.email,
        sendQueue: input.sendQueue,
      });
      paperworkSent = paperwork.sentCount;
      paperworkSkipped = paperwork.skippedCount;
      duplicatesPrevented = paperwork.duplicatesPrevented;
      sentCandidateIds = paperwork.sentCandidateIds;
      failures += paperwork.failedCount;
      stoppedOnError = stoppedOnError || paperwork.stoppedOnError;
      capReachedSends = paperwork.capReached;
      candidatesEvaluated = Math.max(candidatesEvaluated, paperwork.candidatesEvaluated);
      if (paperwork.stoppedOnError) {
        pausedReason = paperwork.rollbackRecommendation;
      }
    }
  } catch (error) {
    stoppedOnError = true;
    failures += 1;
    pausedReason = error instanceof Error ? error.message : "Unexpected autopilot cycle error.";
  }

  const executionTimeMs = Date.now() - started;
  const webhookCompletions = await countWebhookCompletionsSince(referenceMs);
  const queueRemaining = await countQueueDepth();
  const bundleAfter = await getCandidateWorkflowBundle();
  const paperworkCompleted = Object.values(bundleAfter.workflows).filter(
    (r) => r.paperworkStatus === "signed",
  ).length;

  const auditEvents = await loadPaperworkAutomationAuditLog().catch(() => []);
  const cycleAuditCount = auditEvents.filter((e) => Date.parse(e.at) >= referenceMs).length;

  const dashboard: AutopilotDashboardMetrics = {
    candidatesEvaluated,
    recruitersAssigned,
    paperworkSent,
    paperworkCompleted,
    paperworkSkipped,
    duplicatesPrevented,
    failures,
    webhookCompletions,
    averageProcessingTimeMs: executionTimeMs,
    queueDepth: queueRemaining,
    lastSuccessfulCycleAt:
      stoppedOnError && failures > 0 ? priorState.lastSuccessfulCycleAt : generatedAt,
  };

  const paused = stoppedOnError && failures > 0;
  const report: ControlledProductionAutopilotCycleReport = {
    sourcePhase: P154_SOURCE_PHASE,
    generatedAt,
    dryRun: !liveExecution,
    autopilotEnabled: liveExecution && !paused,
    paused,
    pausedReason,
    health,
    enabledFeatures,
    limits: {
      maxRecruiterAssignmentsPerCycle: maxAssignments,
      maxPaperworkSendsPerCycle: maxSends,
      stopOnFirstError: true,
    },
    cycle: {
      candidatesEvaluated,
      recruitersAssigned,
      paperworkSent,
      paperworkSkipped,
      duplicatesPrevented,
      failures,
      executionTimeMs,
      webhookStatus: `passive listener active; ${cycleAuditCount} audit events this cycle`,
      queueRemaining,
      stoppedOnError,
      capReachedAssignments,
      capReachedSends,
      sentCandidateIds,
    },
    dashboard,
    safetyFlags: {
      breezyWrites: false,
      breezyStageMovement: false,
      executeBatchCalled: false,
      duplicatePreventionActive: true,
      auditLoggingEnabled: true,
    },
    rollbackRecommendation: "",
    sentCandidateIds,
  };
  report.rollbackRecommendation = buildRollbackRecommendation(report);

  await saveAutopilotState({
    ...priorState,
    autopilotStatus: paused ? "paused" : liveExecution ? "active" : "stopped",
    paused,
    pausedReason,
    enabledFeatures,
    limits: {
      maxRecruiterAssignmentsPerCycle: maxAssignments,
      maxPaperworkSendsPerCycle: maxSends,
    },
    dashboard,
    lastCycleAt: generatedAt,
    lastSuccessfulCycleAt: paused ? priorState.lastSuccessfulCycleAt : generatedAt,
    lastError: pausedReason,
  });

  return report;
}
