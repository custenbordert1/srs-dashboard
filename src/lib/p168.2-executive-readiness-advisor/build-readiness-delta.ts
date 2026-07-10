import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";
import type { P1682ReadinessDelta, P1682ReadinessSnapshot, P1682Trend } from "@/lib/p168.2-executive-readiness-advisor/types";

function trendForDelta(delta: number | null, invert = false): P1682Trend {
  if (delta == null || delta === 0) return "Stable";
  const positive = invert ? delta < 0 : delta > 0;
  return positive ? "Improving" : "Declining";
}

function trendForScore(before: number, after: number): P1682Trend {
  if (after > before) return "Improving";
  if (after < before) return "Declining";
  return "Stable";
}

function recommendationTrend(before: string, after: string): P1682Trend {
  const rank: Record<string, number> = {
    HOLD_INVESTIGATION: 0,
    WAIT: 1,
    NO_ACTION_REQUIRED: 2,
    RUN_NEXT_BATCH: 3,
  };
  const b = rank[before] ?? 1;
  const a = rank[after] ?? 1;
  if (a > b) return "Improving";
  if (a < b) return "Declining";
  return "Stable";
}

export function snapshotFromDecisionCenter(
  view: P1681ExecutiveDecisionCenterView,
  paperworkSentToday: number,
): P1682ReadinessSnapshot {
  const dropboxGate = view.blocking.checklist.find((c) => c.id === "dropbox_healthy");
  return {
    at: view.generatedAt,
    queueRemaining: view.recommendation.queueRemaining,
    readinessScore: view.systemStatus.productionReadinessScore,
    deferredBacklog: view.systemStatus.deferredReconciliationCount,
    dropboxWithinBudget: dropboxGate?.pass ?? true,
    decisionScore: view.systemStatus.decisionScore,
    recommendation: view.recommendation.action,
    confidence: view.recommendation.confidence,
    reason: view.recommendation.reason,
    paperworkSentToday,
  };
}

export function buildReadinessDelta(
  current: P1682ReadinessSnapshot,
  previous: P1682ReadinessSnapshot | null,
  view: P1681ExecutiveDecisionCenterView,
): P1682ReadinessDelta {
  if (!previous) {
    return {
      hasPrevious: false,
      sinceLabel: "No prior snapshot",
      queue: {
        before: current.queueRemaining,
        after: current.queueRemaining,
        delta: 0,
        trend: "Stable",
      },
      readiness: {
        before: current.readinessScore,
        after: current.readinessScore,
        delta: 0,
        trend: "Stable",
      },
      deferredBacklog: {
        before: current.deferredBacklog,
        after: current.deferredBacklog,
        delta: 0,
        trend: "Stable",
      },
      dropboxBudgetHealthy: {
        before: current.dropboxWithinBudget,
        after: current.dropboxWithinBudget,
      },
      decisionScore: {
        before: current.decisionScore,
        after: current.decisionScore,
        delta: 0,
        trend: "Stable",
      },
      recommendation: {
        before: current.recommendation,
        after: current.recommendation,
        trend: "Stable",
        summary: `${current.recommendation.replace(/_/g, " ")} — baseline`,
      },
      paperworkSentDelta: null,
    };
  }

  const queueDelta = current.queueRemaining - previous.queueRemaining;
  const readinessDelta =
    current.readinessScore != null && previous.readinessScore != null
      ? current.readinessScore - previous.readinessScore
      : null;
  const deferredDelta = current.deferredBacklog - previous.deferredBacklog;
  const scoreDelta = current.decisionScore - previous.decisionScore;
  const recTrend = recommendationTrend(previous.recommendation, current.recommendation);
  const paperworkSentDelta =
    current.paperworkSentToday !== previous.paperworkSentToday
      ? current.paperworkSentToday - previous.paperworkSentToday
      : null;

  const recSummary =
    recTrend === "Improving"
      ? `${current.recommendation.replace(/_/g, " ")} ↑ Improving`
      : recTrend === "Declining"
        ? `${current.recommendation.replace(/_/g, " ")} ↓ Declining`
        : `${current.recommendation.replace(/_/g, " ")} → Stable`;

  return {
    hasPrevious: true,
    sinceLabel: `Since ${new Date(previous.at).toLocaleString()}`,
    queue: {
      before: previous.queueRemaining,
      after: current.queueRemaining,
      delta: queueDelta,
      trend: trendForDelta(queueDelta, true),
    },
    readiness: {
      before: previous.readinessScore,
      after: current.readinessScore,
      delta: readinessDelta,
      trend: trendForDelta(readinessDelta),
    },
    deferredBacklog: {
      before: previous.deferredBacklog,
      after: current.deferredBacklog,
      delta: deferredDelta,
      trend: trendForDelta(deferredDelta, true),
    },
    dropboxBudgetHealthy: {
      before: previous.dropboxWithinBudget,
      after: current.dropboxWithinBudget,
    },
    decisionScore: {
      before: previous.decisionScore,
      after: current.decisionScore,
      delta: scoreDelta,
      trend: trendForScore(previous.decisionScore, current.decisionScore),
    },
    recommendation: {
      before: previous.recommendation,
      after: current.recommendation,
      trend: recTrend,
      summary: recSummary,
    },
    paperworkSentDelta,
  };
}

export function buildTimelineFromSnapshots(
  snapshots: P1682ReadinessSnapshot[],
  view: P1681ExecutiveDecisionCenterView,
): import("@/lib/p168.2-executive-readiness-advisor/types").P1682TimelineEntry[] {
  const entries = snapshots.length > 0 ? snapshots : [snapshotFromDecisionCenter(view, 0)];

  return entries.slice(0, 10).map((snap, index, arr) => {
    const prior = arr[index + 1];
    const durationSincePriorMs = prior
      ? Date.parse(snap.at) - Date.parse(prior.at)
      : null;
    const trend =
      prior == null
        ? ("Stable" as const)
        : trendForScore(prior.decisionScore, snap.decisionScore);

    return {
      at: snap.at,
      recommendation: snap.recommendation.replace(/_/g, " "),
      confidence: snap.confidence,
      decisionScore: snap.decisionScore,
      reason: snap.reason,
      durationSincePriorMs,
      trend,
    };
  });
}
