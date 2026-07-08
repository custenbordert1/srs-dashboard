import { buildP1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center";
import {
  appendP1682ReadinessSnapshot,
  loadP1682ReadinessSnapshots,
} from "@/lib/p168.2-executive-readiness-advisor/advisor-snapshot-store";
import {
  buildRemainingBlockers,
  buildWhatMustChange,
  buildWhyWaiting,
  buildActionPlan,
} from "@/lib/p168.2-executive-readiness-advisor/build-action-plan";
import {
  buildReadinessDelta,
  buildTimelineFromSnapshots,
  snapshotFromDecisionCenter,
} from "@/lib/p168.2-executive-readiness-advisor/build-readiness-delta";
import {
  buildCurrentReadiness,
  calculateReadinessProgress,
} from "@/lib/p168.2-executive-readiness-advisor/calculate-readiness-progress";
import { estimateNextReadyTime } from "@/lib/p168.2-executive-readiness-advisor/estimate-next-ready-time";
import type { P1682ExecutiveReadinessAdvisorReport } from "@/lib/p168.2-executive-readiness-advisor/types";
import { P168_2_SOURCE_PHASE } from "@/lib/p168.2-executive-readiness-advisor/types";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";

export type BuildP1682Options = {
  persistSnapshot?: boolean;
};

export async function buildP1682ExecutiveReadinessAdvisor(
  options: BuildP1682Options = {},
): Promise<P1682ExecutiveReadinessAdvisorReport> {
  const persistSnapshot = options.persistSnapshot !== false;
  const view = await buildP1681ExecutiveDecisionCenterView();
  const runner = await loadP1547RunnerState();
  const paperworkSentToday = runner.dailyMetrics.sent;

  const progress = calculateReadinessProgress(view);
  const currentReadiness = buildCurrentReadiness(view, progress);
  const remainingBlockers = buildRemainingBlockers(view);
  const actionPlan = buildActionPlan(view);
  const estimatedReady = estimateNextReadyTime(view, remainingBlockers);

  const priorSnapshots = await loadP1682ReadinessSnapshots();
  const previous = priorSnapshots[0] ?? null;
  const currentSnapshot = snapshotFromDecisionCenter(view, paperworkSentToday);
  const delta = buildReadinessDelta(currentSnapshot, previous, view);

  const snapshots = persistSnapshot
    ? await appendP1682ReadinessSnapshot(currentSnapshot)
    : [currentSnapshot, ...priorSnapshots];

  const timeline = buildTimelineFromSnapshots(snapshots, view);

  return {
    sourcePhase: P168_2_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    whyWaiting: buildWhyWaiting(view),
    whatMustChange: buildWhatMustChange(view),
    currentReadiness,
    actionPlan,
    estimatedReady,
    recommendationProgress: progress,
    delta,
    timeline,
    warnings: view.warnings,
  };
}
