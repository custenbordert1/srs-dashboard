import { loadAutopilotState } from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";
import {
  getP154MaxPaperworkSendsPerCycle,
  isP154ContinuousEnabled,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import { buildP159BatchHistory } from "@/lib/p159-operations-control-center/build-batch-history";
import {
  buildP159QueueStatus,
  buildP159TodayActivity,
} from "@/lib/p159-operations-control-center/build-queue-and-activity";
import {
  buildP159Recommendation,
  buildP159RunnerStatus,
} from "@/lib/p159-operations-control-center/build-recommendation";
import { buildP159SafetyChecks } from "@/lib/p159-operations-control-center/build-safety-checks";
import type { P159OperationsControlCenter } from "@/lib/p159-operations-control-center/types";
import { P159_SOURCE_PHASE } from "@/lib/p159-operations-control-center/types";

export type P159DashboardBuildResult = {
  dashboard: P159OperationsControlCenter;
  warnings: string[];
};

export async function buildP159OperationsControlCenter(): Promise<P159DashboardBuildResult> {
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  const [today, queueResult, { batches }, runnerState, autopilot, health] = await Promise.all([
    buildP159TodayActivity(),
    buildP159QueueStatus(),
    buildP159BatchHistory(),
    loadP1547RunnerState(),
    loadAutopilotState(),
    verifyAutopilotSystemHealth(),
  ]);

  warnings.push(...queueResult.warnings);

  const failures = Math.max(
    runnerState.errors,
    autopilot.dashboard.failures,
    today.failures,
    batches.reduce((sum, b) => sum + b.failures, 0),
  );
  today.failures = failures;

  const runner = await buildP159RunnerStatus({ warnings, failures });
  const { recommendation, detail } = buildP159Recommendation({
    systemMode: runner.systemMode,
    healthy: health.healthy,
    failures,
    today,
    queueRemaining: queueResult.queue.queueRemaining,
    eligibleNow: queueResult.queue.eligibleNow,
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
        ...queueResult.queue,
        candidatesEvaluated: Math.max(
          queueResult.candidatesEvaluated,
          autopilot.dashboard.candidatesEvaluated,
          runnerState.candidatesEvaluated,
        ),
      },
      batchHistory: batches,
      safety: buildP159SafetyChecks(),
      continuousMode: {
        available: true,
        enabled: isP154ContinuousEnabled(),
        controlAllowed: false,
        note:
          "Continuous mode requires P154_CONTINUOUS_ENABLED=true on the host and p154.7-continuous-runner --daemon. UI enable is disabled until executive sign-off.",
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
