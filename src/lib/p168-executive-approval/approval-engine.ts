import type { AuthSession } from "@/lib/auth/types";
import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { buildP167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler";
import { gatherP167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import {
  appendP168ApprovalHistoryEntry,
  loadP168ApprovalHistory,
  resolveP168LastExecution,
} from "@/lib/p168-executive-approval/approval-history";
import {
  buildApprovalRecommendation,
  evaluateRunNextBatchGates,
} from "@/lib/p168-executive-approval/build-approval-recommendation";
import type {
  P168ApproveResult,
  P168ExecutiveApprovalReport,
} from "@/lib/p168-executive-approval/approval-types";
import { P168_SOURCE_PHASE } from "@/lib/p168-executive-approval/approval-types";
import { executeP159OperationsControl } from "@/lib/p159-operations-control-center/execute-control-action";
import type { P1547CycleReport } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

export async function buildP168ExecutiveApprovalReport(): Promise<P168ExecutiveApprovalReport> {
  const [scheduler, ctx, history] = await Promise.all([
    buildP167ProductionSchedulerReport(),
    gatherP167SchedulerContext(),
    loadP168ApprovalHistory(),
  ]);

  const recommendation = buildApprovalRecommendation({ scheduler, ctx });
  const warnings = [...scheduler.warnings];

  if (ctx.continuousModeEnabled) {
    warnings.push("Continuous mode is enabled — one-click batch remains manual-only.");
  }
  if (ctx.daemonActive) {
    warnings.push("Daemon is active — approval queue will not auto-execute.");
  }

  return {
    sourcePhase: P168_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    recommendation,
    lastExecution: resolveP168LastExecution(history),
    history: history.slice(0, 20),
    safety: {
      continuousModeEnabled: ctx.continuousModeEnabled,
      daemonActive: ctx.daemonActive,
      processingLockHeld: ctx.processingLockHeld,
      liveCycleEnvEnabled: isP154ControlledProductionAutopilotEnabled(),
      manualOperatorApprovalRequired: true,
    },
    warnings,
  };
}

export async function executeP168ExecutiveApproval(input: {
  session: AuthSession;
  action: "approve" | "dismiss";
  recommendationId: string;
}): Promise<P168ApproveResult> {
  const report = await buildP168ExecutiveApprovalReport();
  const rec = report.recommendation;

  if (rec.id !== input.recommendationId) {
    const historyEntry = (
      await appendP168ApprovalHistoryEntry({
        executiveUserId: input.session.userId,
        executiveEmail: input.session.email ?? null,
        recommendation: rec.action,
        recommendationId: input.recommendationId,
        approved: false,
        executed: false,
        result: "failed",
        paperworkSent: null,
        durationMs: null,
        dropboxRequests: null,
        errors: null,
        message: "Stale recommendation — refresh and try again.",
      })
    )[0]!;

    return {
      ok: false,
      action: input.action,
      message: "Recommendation expired. Refresh and approve the current recommendation.",
      executed: false,
      historyEntry,
      report: await buildP168ExecutiveApprovalReport(),
    };
  }

  if (input.action === "dismiss") {
    const historyEntry = (
      await appendP168ApprovalHistoryEntry({
        executiveUserId: input.session.userId,
        executiveEmail: input.session.email ?? null,
        recommendation: rec.action,
        recommendationId: rec.id,
        approved: false,
        executed: false,
        result: "dismissed",
        paperworkSent: null,
        durationMs: null,
        dropboxRequests: null,
        errors: null,
        message: "Executive dismissed recommendation.",
      })
    )[0]!;

    return {
      ok: true,
      action: input.action,
      message: "Recommendation dismissed.",
      executed: false,
      historyEntry,
      report: await buildP168ExecutiveApprovalReport(),
    };
  }

  if (rec.action !== "RUN_NEXT_BATCH") {
    const historyEntry = (
      await appendP168ApprovalHistoryEntry({
        executiveUserId: input.session.userId,
        executiveEmail: input.session.email ?? null,
        recommendation: rec.action,
        recommendationId: rec.id,
        approved: true,
        executed: false,
        result: "skipped",
        paperworkSent: null,
        durationMs: null,
        dropboxRequests: null,
        errors: null,
        message: `Cannot execute — current recommendation is ${rec.action}.`,
      })
    )[0]!;

    return {
      ok: false,
      action: input.action,
      message: `Approval blocked — current recommendation is ${rec.action}, not RUN_NEXT_BATCH.`,
      executed: false,
      historyEntry,
      report: await buildP168ExecutiveApprovalReport(),
    };
  }

  const ctx = await gatherP167SchedulerContext();
  const gates = evaluateRunNextBatchGates(ctx);
  if (!gates.pass) {
    const historyEntry = (
      await appendP168ApprovalHistoryEntry({
        executiveUserId: input.session.userId,
        executiveEmail: input.session.email ?? null,
        recommendation: rec.action,
        recommendationId: rec.id,
        approved: true,
        executed: false,
        result: "failed",
        paperworkSent: null,
        durationMs: null,
        dropboxRequests: null,
        errors: null,
        message: `Gates failed at approval time: ${gates.blockingFactors.join("; ")}`,
      })
    )[0]!;

    return {
      ok: false,
      action: input.action,
      message: `Execution blocked — ${gates.blockingFactors[0] ?? "safety gate failed"}.`,
      executed: false,
      historyEntry,
      report: await buildP168ExecutiveApprovalReport(),
    };
  }

  if (isP154ContinuousEnabled()) {
    return {
      ok: false,
      action: input.action,
      message: "Execution blocked — continuous mode must remain disabled.",
      executed: false,
      historyEntry: (
        await appendP168ApprovalHistoryEntry({
          executiveUserId: input.session.userId,
          executiveEmail: input.session.email ?? null,
          recommendation: rec.action,
          recommendationId: rec.id,
          approved: true,
          executed: false,
          result: "failed",
          paperworkSent: null,
          durationMs: null,
          dropboxRequests: null,
          errors: null,
          message: "Continuous mode enabled — batch execution refused.",
        })
      )[0]!,
      report: await buildP168ExecutiveApprovalReport(),
    };
  }

  const dropboxBefore = getDropboxSignApiMetricsSnapshot().totalRequests;
  const controlResult = await executeP159OperationsControl({
    session: input.session,
    action: "live_cycle",
    confirmLive: true,
  });

  const cycleReport = controlResult.cycleReport as P1547CycleReport | undefined;
  const dropboxAfter = getDropboxSignApiMetricsSnapshot().totalRequests;
  const dropboxDelta = Math.max(0, dropboxAfter - dropboxBefore);

  const paperworkSent = cycleReport?.metrics.sent ?? null;
  const durationMs = cycleReport?.metrics.durationMs ?? null;
  const errors = cycleReport?.metrics.errors ?? null;
  const success = controlResult.ok && !controlResult.dryRun && (errors ?? 0) === 0;

  const historyEntry = (
    await appendP168ApprovalHistoryEntry({
      executiveUserId: input.session.userId,
      executiveEmail: input.session.email ?? null,
      recommendation: rec.action,
      recommendationId: rec.id,
      approved: true,
      executed: true,
      result: success ? "success" : "failed",
      paperworkSent,
      durationMs,
      dropboxRequests: dropboxDelta,
      errors,
      message: controlResult.message,
    })
  )[0]!;

  return {
    ok: success,
    action: input.action,
    message: controlResult.message,
    executed: true,
    historyEntry,
    report: await buildP168ExecutiveApprovalReport(),
  };
}
