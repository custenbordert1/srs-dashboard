import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActionPlan,
  buildWhyWaiting,
} from "@/lib/p168.2-executive-readiness-advisor/build-action-plan";
import {
  buildCurrentReadiness,
  calculateReadinessProgress,
} from "@/lib/p168.2-executive-readiness-advisor/calculate-readiness-progress";
import { estimateNextReadyTime } from "@/lib/p168.2-executive-readiness-advisor/estimate-next-ready-time";
import {
  buildReadinessDelta,
  snapshotFromDecisionCenter,
} from "@/lib/p168.2-executive-readiness-advisor/build-readiness-delta";
import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";
import { P168_1_SOURCE_PHASE } from "@/lib/p168.1-executive-decision-center/types";

function mockView(overrides: Partial<P1681ExecutiveDecisionCenterView> = {}): P1681ExecutiveDecisionCenterView {
  return {
    sourcePhase: P168_1_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    systemStatus: {
      observationMode: true,
      observationModeLabel: "Observation / Manual",
      runnerStatus: "manual_only",
      continuousMode: false,
      daemonActive: false,
      productionReadinessScore: 60,
      decisionScore: 78,
      decisionGrade: "Caution",
      deferredReconciliationCount: 77,
      monitorBudget: 25,
    },
    recommendation: {
      id: "p168-test",
      action: "WAIT",
      title: "Wait",
      reason: "Waiting on gates",
      confidence: 82,
      expectedSends: 10,
      expectedQueueReduction: 10,
      projectedDropboxRequests: 20,
      estimatedRuntimeMs: 600_000,
      queueRemaining: 54,
      projectedQueueAfterCycle: 44,
      schedulerRecommendation: "WAIT_10_MINUTES",
      nextRecommendedRunAt: new Date(Date.now() + 600_000).toISOString(),
    },
    blocking: {
      checklist: [
        { id: "runner_healthy", label: "Runner healthy", pass: true, detail: null },
        { id: "readiness_threshold", label: "Readiness", pass: false, detail: "Score 60 ≤ 80" },
        { id: "live_env_gate", label: "Live gate", pass: false, detail: "Not enabled" },
        { id: "all_gates", label: "All gates", pass: false, detail: "Blocked" },
      ],
      nextExpectedApprovalAt: null,
      actionRequiredBeforeApproval: "Readiness",
      approveDisabledReason: "Blocked",
    },
    lastExecution: {
      at: null,
      paperworkSent: null,
      durationMs: null,
      dropboxRequests: null,
      errors: null,
      queueReduction: null,
      result: null,
      executiveEmail: null,
    },
    history: [],
    safety: {
      continuousModeEnabled: false,
      daemonActive: false,
      manualApprovalRequired: true,
    },
    warnings: [],
    ...overrides,
  };
}

describe("P168.2 executive readiness advisor", () => {
  it("calculates gate progress from P168.1 checklist", () => {
    const progress = calculateReadinessProgress(mockView());
    assert.equal(progress.gatesTotal, 3);
    assert.equal(progress.gatesComplete, 1);
    assert.ok(progress.progressBar.includes("░"));
  });

  it("builds current readiness from decision score", () => {
    const progress = calculateReadinessProgress(mockView());
    const readiness = buildCurrentReadiness(mockView(), progress);
    assert.equal(readiness.executiveReadinessPercent, 78);
    assert.equal(readiness.remainingGates, 2);
  });

  it("explains why waiting", () => {
    const why = buildWhyWaiting(mockView());
    assert.ok(why.toLowerCase().includes("readiness") || why.toLowerCase().includes("live"));
  });

  it("estimates ready time from scheduler", () => {
    const eta = estimateNextReadyTime(mockView(), ["Readiness"]);
    assert.ok(eta.estimatedReadyAt);
    assert.ok(eta.confidence > 0);
    assert.equal(eta.projectedSends, 10);
  });

  it("builds delta between snapshots", () => {
    const current = snapshotFromDecisionCenter(mockView(), 20);
    const previous = snapshotFromDecisionCenter(
      mockView({
        systemStatus: {
          ...mockView().systemStatus,
          decisionScore: 70,
          deferredReconciliationCount: 90,
        },
        recommendation: {
          ...mockView().recommendation,
          queueRemaining: 64,
        },
      }),
      10,
    );
    const delta = buildReadinessDelta(current, previous, mockView());
    assert.equal(delta.hasPrevious, true);
    assert.equal(delta.queue.delta, -10);
    assert.equal(delta.decisionScore.trend, "Improving");
  });

  it("orders incomplete actions in action plan", () => {
    const plan = buildActionPlan(mockView());
    assert.ok(plan.some((a) => !a.complete));
    assert.ok(plan.every((a) => a.targetValue));
  });
});
