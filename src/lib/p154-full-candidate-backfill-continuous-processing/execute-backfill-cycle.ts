import type { AuthSession } from "@/lib/auth/types";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
import { runFreshnessRescue } from "@/lib/candidate-ingestion/fresh-candidate-ingestion-rescue";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { executeControlledProductionAutopilot } from "@/lib/p154-controlled-production-autopilot-activation";
import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";
import {
  applyP1544CycleEnvFlags,
  getP154BackfillSince,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/config";
import { classifyCandidatesSince } from "@/lib/p154-full-candidate-backfill-continuous-processing/classify-candidates";
import { runFullBreezyCandidateBackfill } from "@/lib/p154-full-candidate-backfill-continuous-processing/run-full-breezy-backfill";
import {
  loadP1544State,
  releaseP1544Lock,
  saveP1544State,
  tryAcquireP1544Lock,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/backfill-store";
import type {
  P1544CycleReport,
  P1544DashboardMetrics,
  P1544SchedulerMode,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";
import { P1544_SOURCE_PHASE } from "@/lib/p154-full-candidate-backfill-continuous-processing/types";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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

async function countSignedToday(): Promise<number> {
  const bundle = await getCandidateWorkflowBundle();
  const start = Date.parse(`${todayKey()}T00:00:00.000Z`);
  return Object.values(bundle.workflows).filter(
    (r) =>
      r.paperworkStatus === "signed" &&
      r.paperworkSignedAt &&
      Date.parse(r.paperworkSignedAt) >= start,
  ).length;
}

async function countSentToday(): Promise<number> {
  const audit = await loadPaperworkAutomationAuditLog();
  const start = Date.parse(`${todayKey()}T00:00:00.000Z`);
  return audit.filter(
    (e) => e.sendResult === "sent" && e.executed === true && Date.parse(e.at) >= start,
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

async function refreshBreezyCandidatesForCycle(input: {
  fullBackfill: boolean;
  backfillSince: string;
  byUserId?: string;
}): Promise<import("@/lib/p154-full-candidate-backfill-continuous-processing/types").P1544BackfillReport> {
  if (input.fullBackfill) {
    return runFullBreezyCandidateBackfill({
      backfillSince: input.backfillSince,
      byUserId: input.byUserId,
    });
  }

  const started = Date.now();
  const ingestion = await runCandidateIngestionSync({
    byUserId: input.byUserId,
    runPipeline: true,
    enrichQuestionnaires: true,
    completeCycle: false,
  });
  const { result: rescue } = await runFreshnessRescue({ force: true });
  const incremental = await runFullBreezyCandidateBackfill({
    backfillSince: input.backfillSince,
    includeClosed: true,
    includeArchived: false,
    byUserId: input.byUserId,
  });

  return {
    ...incremental,
    warnings: [
      ...incremental.warnings,
      ingestion.ok
        ? `Ingestion sync: ${ingestion.newCandidates} new, ${ingestion.positionsScannedThisRun} positions.`
        : `Ingestion sync failed: ${ingestion.error ?? "unknown"}`,
      rescue.ran
        ? `Freshness rescue: ${rescue.newCandidates} new from ${rescue.positionsRescanned} positions.`
        : `Freshness rescue skipped: ${rescue.reason ?? "not needed"}`,
    ],
    executionTimeMs: Date.now() - started,
  };
}

export async function executeP1544BackfillContinuousCycle(input: {
  session: AuthSession;
  dryRun?: boolean;
  mode?: P1544SchedulerMode;
  fullBackfill?: boolean;
  skipLock?: boolean;
  userId?: string;
}): Promise<P1544CycleReport> {
  const generatedAt = new Date().toISOString();
  const mode = input.mode ?? "manual";
  const backfillSince = getP154BackfillSince();
  const dryRun = input.dryRun ?? true;
  const live = !dryRun;

  let skippedOverlap = false;
  let runId = "dry-run";

  if (!input.skipLock) {
    const lock = await tryAcquireP1544Lock({ mode });
    if (!lock.acquired) {
      skippedOverlap = true;
      const state = await loadP1544State();
      return {
        sourcePhase: P1544_SOURCE_PHASE,
        generatedAt,
        dryRun,
        skippedOverlap: true,
        backfill: {
          backfillSince,
          backfillThrough: todayKey(),
          totalPositionsScanned: 0,
          activePositionsScanned: 0,
          closedPositionsScanned: 0,
          archivedPositionsScanned: 0,
          totalCandidatesFound: 0,
          candidatesSinceJune: 0,
          candidatesAlreadyInStore: 0,
          newlyDiscoveredCandidates: 0,
          candidatesMissingBeforeBackfill: 0,
          mergedIntoStore: state.dashboard.totalCandidatesScanned,
          workflowsCreated: 0,
          workflowsReconciled: 0,
          truncated: false,
          warnings: ["Skipped — overlapping run lock held."],
          executionTimeMs: 0,
        },
        classification: {
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
        },
        controlledCycle: null,
        dashboard: state.dashboard,
        safetyFlags: {
          breezyWrites: false,
          duplicatePreventionActive: true,
          overlapLockActive: true,
          stopOnFirstError: true,
          auditLoggingEnabled: true,
        },
      };
    }
    runId = lock.runId;
  }

  try {
    const health = await verifyAutopilotSystemHealth();
    if (!health.healthy) {
      throw new Error(health.abortReason ?? "System health check failed.");
    }

    applyP1544CycleEnvFlags(process.env, live);

    const backfill = await refreshBreezyCandidatesForCycle({
      fullBackfill: input.fullBackfill ?? true,
      backfillSince,
      byUserId: input.userId ?? input.session.userId,
    });

    const classification = await classifyCandidatesSince({
      backfillSince,
      maxRows: 200,
    });

    let controlledCycle = null;
    if (!skippedOverlap) {
      controlledCycle = await executeControlledProductionAutopilot({
        session: input.session,
        dryRun: !live,
        userId: input.userId ?? input.session.userId,
      });
      if (controlledCycle.cycle.stoppedOnError && controlledCycle.cycle.failures > 0) {
        throw new Error(controlledCycle.pausedReason ?? "Controlled cycle stopped on error.");
      }
    }

    const dashboard: P1544DashboardMetrics = {
      totalCandidatesScanned: backfill.mergedIntoStore,
      totalSinceJune: classification.totalClassified,
      newCandidatesDiscovered: backfill.newlyDiscoveredCandidates,
      eligibleToday: classification.buckets.eligible_for_paperwork,
      sentToday: await countSentToday(),
      signedToday: await countSignedToday(),
      activeSignatureRequests: await countActiveSignatures(),
      duplicatesPrevented: controlledCycle?.cycle.duplicatesPrevented ?? 0,
      queueRemaining: controlledCycle?.cycle.queueRemaining ?? (await countQueueDepth()),
      nextScheduledRunAt: null,
      lastSuccessfulRunAt: generatedAt,
    };

    const state = await loadP1544State();
    state.lastBackfillAt = generatedAt;
    state.lastCycleAt = generatedAt;
    state.lastSuccessfulCycleAt = generatedAt;
    state.lastError = null;
    state.dashboard = dashboard;
    await saveP1544State(state);

    return {
      sourcePhase: P1544_SOURCE_PHASE,
      generatedAt,
      dryRun: !live,
      skippedOverlap,
      backfill,
      classification,
      controlledCycle,
      dashboard,
      safetyFlags: {
        breezyWrites: false,
        duplicatePreventionActive: true,
        overlapLockActive: !input.skipLock,
        stopOnFirstError: true,
        auditLoggingEnabled: true,
      },
    };
  } catch (error) {
    const state = await loadP1544State();
    state.lastError = error instanceof Error ? error.message : "P154.4 cycle failed.";
    state.lastCycleAt = generatedAt;
    await saveP1544State(state);
    throw error;
  } finally {
    if (!input.skipLock) {
      await releaseP1544Lock(runId);
    }
  }
}
