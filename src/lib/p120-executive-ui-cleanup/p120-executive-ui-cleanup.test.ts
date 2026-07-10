import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExecutiveCommandSummaryMetrics,
  enrichTopActions,
  resolveExecutiveGoStatus,
  resolveRecommendedOwner,
} from "@/lib/p120-executive-ui-cleanup/build-executive-action-summary";
import { P120_COLLAPSED_SECTIONS, P120_REMOVED_PANELS } from "@/lib/p120-executive-ui-cleanup/types";

const baseOperations = {
  goNoGo: "GO",
  healthSummary: {
    currentMode: "disabled",
    blockedCount: 100,
    runnerScheduleEnabled: false,
  },
  queueDepth: {
    approvedMappingReady: 6,
    pendingMappingReview: 50,
  },
  safetyStatus: [
    { id: "live_mode_disabled", passed: true, label: "Live mode disabled", detail: "" },
    { id: "operator_checklist", passed: false, label: "Operator checklist", detail: "" },
  ],
} as never;

const baseRecovery = {
  goNoGo: "NO-GO",
  executiveSummary: { estimatedPaperworkUnlocked: 42 },
  actionQueue: [
    {
      actionId: "a1",
      actionType: "Approve Mapping",
      priority: 100,
      expectedUnlockCount: 5,
      estimatedPaperworkIncrease: 5,
      estimatedRecruiterMinutes: 10,
      businessImpact: "high",
      reason: "mapping backlog",
      candidateIds: ["c1"],
      recoveryCategories: ["REQUIRES_MAPPING_APPROVAL"],
      sourcePhase: "P119",
    },
  ],
} as never;

describe("p120-executive-ui-cleanup", () => {
  it("tracks removed duplicate panels", () => {
    assert.ok(P120_REMOVED_PANELS.includes("ExecutivePaperworkDashboardPanel"));
    assert.ok(P120_REMOVED_PANELS.includes("PaperworkUnlockQueuePanel"));
    assert.ok(P120_REMOVED_PANELS.includes("BreezyJobPublishReviewPanel"));
  });

  it("defines collapsed section groups", () => {
    assert.ok(P120_COLLAPSED_SECTIONS.includes("verbose_diagnostics"));
    assert.ok(P120_COLLAPSED_SECTIONS.includes("detailed_recovery_categories"));
  });

  it("resolves GO WITH CONDITIONS when recovery is NO-GO but operations GO", () => {
    assert.equal(
      resolveExecutiveGoStatus({ operations: baseOperations, recovery: baseRecovery }),
      "GO WITH CONDITIONS",
    );
  });

  it("builds executive summary metrics", () => {
    const metrics = buildExecutiveCommandSummaryMetrics({
      operations: baseOperations,
      recovery: baseRecovery,
    });
    assert.equal(metrics.automationLive, "NOT LIVE");
    assert.equal(metrics.paperworkSendingAutomatically, "SENDS DISABLED");
    assert.equal(metrics.totalBlockedCandidates, 100);
    assert.equal(metrics.estimatedRecoverableCandidates, 42);
    assert.equal(metrics.approvedMappingsReady, 6);
  });

  it("enriches top actions with owner and safety", () => {
    const actions = enrichTopActions(baseRecovery.actionQueue, 1);
    assert.equal(actions[0]?.title, "Approve Mapping");
    assert.equal(resolveRecommendedOwner("Approve Mapping"), "Taylor (mapping reviewer)");
    assert.equal(actions[0]?.humanApprovalRequired, true);
  });
});
