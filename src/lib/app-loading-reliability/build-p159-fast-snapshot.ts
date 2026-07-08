import { buildP159BatchHistory } from "@/lib/p159-operations-control-center/build-batch-history";
import { buildP159SafetyChecks } from "@/lib/p159-operations-control-center/build-safety-checks";
import type { P159DashboardBuildResult } from "@/lib/p159-operations-control-center/build-operations-control-center";
import {
  buildP159Recommendation,
  buildP159RunnerStatus,
} from "@/lib/p159-operations-control-center/build-recommendation";
import { P159_SOURCE_PHASE } from "@/lib/p159-operations-control-center/types";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import {
  getP154MaxPaperworkSendsPerCycle,
  isP154ContinuousEnabled,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";

/** Fast degraded snapshot — runner state + audit batches only (no Breezy classification). */
export async function buildP159FastSnapshot(): Promise<P159DashboardBuildResult> {
  const generatedAt = new Date().toISOString();
  const warnings = ["Fast degraded snapshot — full queue classification skipped due to timeout"];
  const [{ batches, sendBatches }, runnerState] = await Promise.all([
    buildP159BatchHistory(),
    loadP1547RunnerState(),
  ]);

  const paperworkSent = sendBatches.reduce((sum, b) => sum + b.sendCount, 0);
  const failures = batches.reduce((sum, b) => sum + b.failures, 0);

  const today = {
    paperworkSent,
    sendBatchCount: sendBatches.length,
    sendBatches,
    signedToday: runnerState.dailyMetrics.signaturesCompleted,
    viewedToday: 0,
    pendingSignatures: 0,
    duplicatesPrevented: 0,
    failures,
  };

  const runner = await buildP159RunnerStatus({ warnings, failures });
  const { recommendation, detail } = buildP159Recommendation({
    systemMode: runner.systemMode,
    healthy: failures === 0,
    failures,
    today,
    queueRemaining: runnerState.queueRemaining,
    eligibleNow: 0,
    continuousEnabled: isP154ContinuousEnabled(),
    autopilotEnabled: isP154ControlledProductionAutopilotEnabled(),
  });

  const maxSends = getP154MaxPaperworkSendsPerCycle();

  return {
    warnings,
    dashboard: {
      sourcePhase: P159_SOURCE_PHASE,
      generatedAt,
      runner,
      today,
      queue: {
        candidatesEvaluated: runnerState.candidatesEvaluated,
        eligibleNow: 0,
        readyAfterRecruiterAssignment: 0,
        readyAfterWorkflowTransition: 0,
        waitingOnSignature: 0,
        alreadySent: 0,
        alreadySigned: 0,
        duplicates: 0,
        invalidEmails: 0,
        manualReview: 0,
        blocked: 0,
        queueRemaining: runnerState.queueRemaining,
      },
      batchHistory: batches,
      safety: buildP159SafetyChecks(),
      continuousMode: {
        available: true,
        enabled: isP154ContinuousEnabled(),
        controlAllowed: false,
        note: "Continuous mode disabled — observation mode only.",
      },
      liveCycleGates: {
        executiveSessionRequired: true,
        confirmLiveRequired: true,
        envFlagRequired: "P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED",
        envFlagEnabled: isP154ControlledProductionAutopilotEnabled(),
        maxSendsPerCycle: maxSends,
      },
      recommendation,
      recommendationDetail: detail,
    },
  };
}
