import {
  P167_WAIT_MINUTES,
  waitRecommendationForMinutes,
} from "@/lib/p167-intelligent-production-scheduler/constants";
import {
  estimateNextCycleSends,
  isDropboxThrottlingDetected,
  projectDropboxUsage,
  type P167SchedulerContext,
} from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P167SimulationResult, P167SimulationScenario } from "@/lib/p167-intelligent-production-scheduler/types";

const SCENARIOS: Array<{ scenario: P167SimulationScenario; delayMinutes: number }> = [
  { scenario: "run_now", delayMinutes: 0 },
  { scenario: "run_in_2_min", delayMinutes: 2 },
  { scenario: "run_in_5_min", delayMinutes: 5 },
  { scenario: "run_in_10_min", delayMinutes: 10 },
  { scenario: "run_in_15_min", delayMinutes: 15 },
];

function simulateAtDelay(ctx: P167SchedulerContext, delayMinutes: number): P167SimulationResult {
  const scenarioEntry = SCENARIOS.find((s) => s.delayMinutes === delayMinutes)!;
  const adjustedCtx: P167SchedulerContext = {
    ...ctx,
    nowMs: ctx.nowMs + delayMinutes * 60_000,
    timeSinceLastCycleMs:
      ctx.timeSinceLastCycleMs != null
        ? ctx.timeSinceLastCycleMs + delayMinutes * 60_000
        : null,
  };

  const expectedSends = estimateNextCycleSends(adjustedCtx);
  const api = projectDropboxUsage(expectedSends);
  const expectedQueueReduction = Math.min(expectedSends, adjustedCtx.queue.queueRemaining);
  const expectedBacklog = Math.max(0, adjustedCtx.queue.queueRemaining - expectedSends);

  const notes: string[] = ["Read-only simulation — no production actions taken."];
  let recommendation = waitRecommendationForMinutes(delayMinutes);

  if (expectedSends === 0) {
    recommendation = "NO_ELIGIBLE_CANDIDATES";
    notes.push("No eligible candidates at simulated time.");
  } else if (
    adjustedCtx.processingLockHeld ||
    adjustedCtx.daemonActive ||
    adjustedCtx.continuousModeEnabled
  ) {
    recommendation = waitRecommendationForMinutes(Math.max(delayMinutes, 5));
    notes.push("Safety gate would block immediate run at simulated time.");
  } else if (!api.withinBudget) {
    recommendation = "WAIT_10_MINUTES";
    notes.push("Projected Dropbox API would exceed per-cycle budget.");
  } else if (isDropboxThrottlingDetected(adjustedCtx)) {
    recommendation = "PAUSE_INVESTIGATION_REQUIRED";
    notes.push("Dropbox throttling would still be active.");
  } else if (
    delayMinutes === 0 &&
    (adjustedCtx.timeSinceLastCycleMs == null || adjustedCtx.timeSinceLastCycleMs >= 2 * 60_000) &&
    !isDropboxThrottlingDetected(adjustedCtx)
  ) {
    recommendation = "READY_NOW";
    notes.push("All simulated gates pass for immediate capped cycle.");
  } else if (delayMinutes > 0) {
    notes.push(`Simulated run after ${delayMinutes} minute spacing.`);
  }

  return {
    scenario: scenarioEntry.scenario,
    delayMinutes,
    recommendation,
    expectedSends,
    expectedApiUsage: { post: api.postRequests, get: api.getRequests, total: api.totalRequests },
    expectedQueueReduction,
    expectedBacklog,
    notes,
  };
}

export function buildP167Simulations(ctx: P167SchedulerContext): P167SimulationResult[] {
  return SCENARIOS.map(({ delayMinutes }) => simulateAtDelay(ctx, delayMinutes));
}

export { scenarioLabel } from "@/lib/p167-intelligent-production-scheduler/presentation";

export { P167_WAIT_MINUTES };
