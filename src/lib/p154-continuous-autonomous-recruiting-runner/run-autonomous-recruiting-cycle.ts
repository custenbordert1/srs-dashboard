import type { AuthSession } from "@/lib/auth/types";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { executeP1544BackfillContinuousCycle } from "@/lib/p154-full-candidate-backfill-continuous-processing/execute-backfill-cycle";
import { classifyCandidatesSince } from "@/lib/p154-full-candidate-backfill-continuous-processing/classify-candidates";
import { executeControlledProductionAutopilot } from "@/lib/p154-controlled-production-autopilot-activation";
import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";
import { runPaperworkMonitorCycle } from "@/lib/paperwork-monitor/run-paperwork-monitor-cycle";
import { appendP1547RunnerAudit } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-audit";
import {
  applyP1547RunnerEnvFlags,
  getP154BackfillSinceDate,
  getP154MaxRuntimeMinutes,
  isP154StopOnError,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import {
  recordP1547CycleMetrics,
  releaseP1547RunnerLock,
  tryAcquireP1547RunnerLock,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import type {
  P1547CycleMetrics,
  P1547CycleReport,
  P1547SchedulerMode,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/types";
import { P1547_SOURCE_PHASE } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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

function assertWithinRuntime(deadlineMs: number): void {
  if (Date.now() > deadlineMs) {
    throw new Error(`P154.7 cycle exceeded P154_MAX_RUNTIME_MINUTES budget.`);
  }
}

export async function runAutonomousRecruitingCycle(input: {
  session: AuthSession;
  dryRun?: boolean;
  mode?: P1547SchedulerMode;
  cycleNumber?: number;
  fullBackfill?: boolean;
  skipLock?: boolean;
  userId?: string;
}): Promise<P1547CycleReport> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const mode = input.mode ?? "manual";
  const dryRun = input.dryRun ?? true;
  const cycleNumber = input.cycleNumber ?? 1;
  const live = !dryRun;
  const deadlineMs = startedMs + getP154MaxRuntimeMinutes() * 60_000;
  const backfillSince = getP154BackfillSinceDate();
  process.env.P154_BACKFILL_SINCE = backfillSince;
  applyP1547RunnerEnvFlags(process.env, live);

  let skippedOverlap = false;
  let runId = "dry-run";

  if (!input.skipLock) {
    const lock = await tryAcquireP1547RunnerLock({ mode });
    if (!lock.acquired) {
      skippedOverlap = true;
      const queueRemaining = await countQueueDepth();
      const completedAt = new Date().toISOString();
      const metrics: P1547CycleMetrics = {
        cycleNumber,
        startedAt,
        completedAt,
        durationMs: Date.now() - startedMs,
        candidatesEvaluated: 0,
        assigned: 0,
        sent: 0,
        skipped: 0,
        duplicatesPrevented: 0,
        errors: 0,
        queueRemaining,
        dryRun,
      };
      await recordP1547CycleMetrics(metrics);
      return {
        sourcePhase: P1547_SOURCE_PHASE,
        generatedAt: startedAt,
        dryRun,
        skippedOverlap: true,
        cycleNumber,
        metrics: {
          cycleNumber,
          startedAt,
          completedAt,
          durationMs: Date.now() - startedMs,
          candidatesEvaluated: 0,
          assigned: 0,
          sent: 0,
          skipped: 0,
          duplicatesPrevented: 0,
          errors: 0,
          queueRemaining,
          dryRun,
        },
        ingestion: { newCandidates: 0, mergedIntoStore: 0, positionsScanned: 0 },
        controlledCycle: null,
        webhookSync: null,
        stoppedOnError: false,
        error: "Skipped — overlapping P154.7 runner lock held.",
      };
    }
    runId = lock.runId;
  }

  let stoppedOnError = false;
  let error: string | null = null;

  try {
    assertWithinRuntime(deadlineMs);

    let backfillReport: Awaited<ReturnType<typeof executeP1544BackfillContinuousCycle>>;
    if (mode === "simulation" && dryRun) {
      const health = await verifyAutopilotSystemHealth();
      if (!health.healthy) {
        throw new Error(health.abortReason ?? "System health check failed.");
      }
      const classification = await classifyCandidatesSince({ backfillSince, maxRows: 200 });
      const bundle = await getCandidateWorkflowBundle();
      const workflowCount = Object.keys(bundle.workflows).length;
      const controlledCycle = await executeControlledProductionAutopilot({
        session: input.session,
        dryRun: true,
        userId: input.userId ?? input.session.userId,
      });
      backfillReport = {
        sourcePhase: "P154.4",
        generatedAt: new Date().toISOString(),
        dryRun: true,
        skippedOverlap: false,
        backfill: {
          backfillSince,
          backfillThrough: todayKey(),
          totalPositionsScanned: 0,
          activePositionsScanned: 0,
          closedPositionsScanned: 0,
          archivedPositionsScanned: 0,
          totalCandidatesFound: 0,
          candidatesSinceJune: classification.totalClassified,
          candidatesAlreadyInStore: workflowCount,
          newlyDiscoveredCandidates: 0,
          candidatesMissingBeforeBackfill: 0,
          mergedIntoStore: workflowCount,
          workflowsCreated: 0,
          workflowsReconciled: 0,
          truncated: false,
          warnings: ["Simulation mode — Breezy refresh skipped for fast validation."],
          executionTimeMs: 0,
        },
        classification,
        controlledCycle,
        dashboard: {
          totalCandidatesScanned: workflowCount,
          totalSinceJune: classification.totalClassified,
          newCandidatesDiscovered: 0,
          eligibleToday: classification.buckets.eligible_for_paperwork,
          sentToday: 0,
          signedToday: 0,
          activeSignatureRequests: 0,
          duplicatesPrevented: controlledCycle.cycle.duplicatesPrevented,
          queueRemaining: controlledCycle.cycle.queueRemaining,
          nextScheduledRunAt: null,
          lastSuccessfulRunAt: new Date().toISOString(),
        },
        safetyFlags: {
          breezyWrites: false,
          duplicatePreventionActive: true,
          overlapLockActive: true,
          stopOnFirstError: true,
          auditLoggingEnabled: true,
        },
      };
    } else {
      backfillReport = await executeP1544BackfillContinuousCycle({
        session: input.session,
        dryRun,
        mode: mode === "simulation" ? "manual" : mode,
        fullBackfill: input.fullBackfill ?? cycleNumber === 1,
        skipLock: true,
        userId: input.userId ?? input.session.userId,
      });
    }

    assertWithinRuntime(deadlineMs);

    const webhookSync = await runPaperworkMonitorCycle({
      mode: dryRun ? "dryRun" : "runOnce",
      byUserId: input.userId ?? "p154.7-continuous-runner",
    });

    const controlled = backfillReport.controlledCycle;
    const candidatesEvaluated =
      controlled?.cycle.candidatesEvaluated ?? backfillReport.classification.totalClassified;
    const assigned = controlled?.cycle.recruitersAssigned ?? 0;
    const sent = controlled?.cycle.paperworkSent ?? 0;
    const skipped = controlled?.cycle.paperworkSkipped ?? 0;
    const duplicatesPrevented =
      (controlled?.cycle.duplicatesPrevented ?? 0) +
      backfillReport.classification.buckets.duplicate;
    const errors =
      (controlled?.cycle.failures ?? 0) + (webhookSync.report.metrics.errorsThisCycle ?? 0);
    const queueRemaining = controlled?.cycle.queueRemaining ?? (await countQueueDepth());

    const completedAt = new Date().toISOString();
    const metrics: P1547CycleMetrics = {
      cycleNumber,
      startedAt,
      completedAt,
      durationMs: Date.now() - startedMs,
      candidatesEvaluated,
      assigned,
      sent,
      skipped,
      duplicatesPrevented,
      errors,
      queueRemaining,
      dryRun,
    };

    await recordP1547CycleMetrics(metrics);

    if (live && errors > 0 && isP154StopOnError()) {
      stoppedOnError = true;
      error = controlled?.pausedReason ?? "Cycle completed with errors.";
      throw new Error(error);
    }

    await appendP1547RunnerAudit({
      phase: P1547_SOURCE_PHASE,
      cycleNumber,
      dryRun,
      metrics,
      signedToday: await countSignedToday(),
    });

    return {
      sourcePhase: P1547_SOURCE_PHASE,
      generatedAt: completedAt,
      dryRun,
      skippedOverlap: backfillReport.skippedOverlap,
      cycleNumber,
      metrics,
      ingestion: {
        newCandidates: backfillReport.backfill.newlyDiscoveredCandidates,
        mergedIntoStore: backfillReport.backfill.mergedIntoStore,
        positionsScanned: backfillReport.backfill.totalPositionsScanned,
      },
      controlledCycle: controlled,
      webhookSync: {
        synced: webhookSync.report.metrics.syncedThisCycle,
        errors: webhookSync.report.metrics.errorsThisCycle,
      },
      stoppedOnError,
      error: null,
    };
  } catch (cycleError) {
    stoppedOnError = true;
    error = cycleError instanceof Error ? cycleError.message : "P154.7 cycle failed.";
    const metrics: P1547CycleMetrics = {
      cycleNumber,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      candidatesEvaluated: 0,
      assigned: 0,
      sent: 0,
      skipped: 0,
      duplicatesPrevented: 0,
      errors: 1,
      queueRemaining: await countQueueDepth(),
      dryRun,
    };
    await recordP1547CycleMetrics(metrics);
    await appendP1547RunnerAudit({
      phase: P1547_SOURCE_PHASE,
      cycleNumber,
      dryRun,
      error,
      metrics,
    });

    if (isP154StopOnError()) {
      throw cycleError;
    }

    return {
      sourcePhase: P1547_SOURCE_PHASE,
      generatedAt: new Date().toISOString(),
      dryRun,
      skippedOverlap,
      cycleNumber,
      metrics,
      ingestion: { newCandidates: 0, mergedIntoStore: 0, positionsScanned: 0 },
      controlledCycle: null,
      webhookSync: null,
      stoppedOnError,
      error,
    };
  } finally {
    if (!input.skipLock) {
      await releaseP1547RunnerLock(runId);
    }
  }
}
