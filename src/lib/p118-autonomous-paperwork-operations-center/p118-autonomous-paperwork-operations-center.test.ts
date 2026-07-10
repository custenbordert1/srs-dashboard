import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildOperationsAlerts, buildRunnerHealthSummary } from "@/lib/p118-autonomous-paperwork-operations-center/build-operations-alerts";
import { buildPaperworkSafetyStatus } from "@/lib/p118-autonomous-paperwork-operations-center/build-safety-status";
import { buildQueueDepth } from "@/lib/p118-autonomous-paperwork-operations-center/build-queue-depth";
import { resolveRunnerOperationalMode } from "@/lib/p118-autonomous-paperwork-operations-center/resolve-runner-operational-mode";
import type { AutonomousPaperworkRunnerState } from "@/lib/autonomous-paperwork-runner/types";
import type { AutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/types";
import type { LiveSendOperatorChecklistReport } from "@/lib/live-send-operator-checklist/types";

const baseState = {
  version: 2,
  runnerStatus: "stopped",
  scheduleEnabled: false,
  scheduleIntervalMs: 300000,
  lastRunAt: null,
  lastSuccessfulRunAt: null,
  lastProcessedCheckpoint: null,
  processingLock: null,
  lastError: null,
  lastRunDurationMs: null,
  averageRunDurationMs: null,
  runCount: 0,
  blockedRegistry: {},
  lastFullReconciliationAt: null,
  fullReconciliationIntervalMs: 86400000,
  updatedAt: new Date().toISOString(),
} as AutonomousPaperworkRunnerState;

const baseReport = {
  mode: "dryRun",
  metrics: {
    candidatesEvaluated: 10,
    readyToSend: 2,
    sent: 3,
    skippedAlreadySent: 1,
    blockedInvalidEmail: 1,
    blockedUnpublishedJob: 0,
    blockedDuplicateRisk: 1,
    blockedP84: 0,
    blockedManualReview: 0,
    remainingActionNeeded: 5,
    autoRepairedCount: 0,
  },
  candidates: [
    { candidateId: "c1", category: "ready_to_send", blockerCategory: null },
    { candidateId: "c2", category: "blocked", blockerCategory: "project_not_mappable" },
    { candidateId: "c3", category: "blocked", blockerCategory: "duplicate_risk" },
    { candidateId: "c4", category: "sent", blockerCategory: "already_sent" },
    { candidateId: "c5", category: "blocked", blockerCategory: "invalid_email" },
    { candidateId: "c6", category: "blocked", blockerCategory: "project_mapping_review" },
  ],
} as unknown as AutonomousPaperworkReport;

const operatorGo = {
  goNoGo: "GO",
  goNoGoReason: "ok",
} as LiveSendOperatorChecklistReport;

describe("p118-autonomous-paperwork-operations-center", () => {
  it("resolves dryRun when live flag unset", () => {
    assert.equal(
      resolveRunnerOperationalMode({
        config: {
          scheduleEnabled: true,
          defaultMode: "dryRun",
          liveEngineMode: null,
          fullReconciliationDaily: false,
        },
        state: { ...baseState, runnerStatus: "idle", scheduleEnabled: true },
      }),
      "dryRun",
    );
  });

  it("resolves live when live engine mode configured", () => {
    assert.equal(
      resolveRunnerOperationalMode({
        config: {
          scheduleEnabled: true,
          defaultMode: "scheduled",
          liveEngineMode: "executeOne",
          fullReconciliationDaily: false,
        },
        state: baseState,
      }),
      "live",
    );
  });

  it("resolves disabled when schedule off and runner stopped", () => {
    assert.equal(
      resolveRunnerOperationalMode({
        config: {
          scheduleEnabled: false,
          defaultMode: "dryRun",
          liveEngineMode: null,
          fullReconciliationDaily: false,
        },
        state: baseState,
      }),
      "disabled",
    );
  });

  it("builds queue depth from paperwork report", () => {
    const depth = buildQueueDepth({
      paperworkReport: baseReport,
      approvedMappings: [
        {
          qualifies: true,
          candidateId: "c2",
          closedPositionId: "closed-1",
          recommendedPositionId: "pub-1",
          recommendedPositionTitle: "Job",
          confidenceScore: 80,
          reviewer: "Taylor",
          timestamp: new Date().toISOString(),
          mappingReasons: [],
          reason: "approved",
        },
      ],
      monitorMetrics: {
        awaitingSignature: 4,
        signedToday: 2,
        readyForOnboarding: 1,
      } as never,
      pendingMappingReviewCount: 12,
    });

    assert.equal(depth.readyToSend, 1);
    assert.equal(depth.approvedMappingReady, 1);
    assert.equal(depth.pendingMappingReview, 12);
    assert.equal(depth.projectNotMappable, 1);
    assert.equal(depth.duplicateRisk, 1);
    assert.equal(depth.awaitingSignature, 4);
  });

  it("safety status passes default dry-run protections", () => {
    const gates = buildPaperworkSafetyStatus({
      config: {
        scheduleEnabled: false,
        defaultMode: "dryRun",
        liveEngineMode: null,
        fullReconciliationDaily: false,
      },
      p84Flags: DEFAULT_P84_FEATURE_FLAGS,
      operatorChecklist: operatorGo,
      auditLogPresent: true,
    });

    assert.equal(gates.find((gate) => gate.id === "execute_batch_disabled")?.passed, true);
    assert.equal(gates.find((gate) => gate.id === "duplicate_protection")?.passed, true);
    assert.equal(gates.find((gate) => gate.id === "live_mode_disabled")?.passed, true);
  });

  it("flags live mode without operator GO", () => {
    const alerts = buildOperationsAlerts({
      config: {
        scheduleEnabled: true,
        defaultMode: "scheduled",
        liveEngineMode: "executeOne",
        fullReconciliationDaily: false,
      },
      state: baseState,
      queueDepth: buildQueueDepth({
        paperworkReport: baseReport,
        approvedMappings: [],
        monitorMetrics: null,
        pendingMappingReviewCount: 0,
      }),
      operatorChecklist: { goNoGo: "NO-GO", goNoGoReason: "blocked" } as LiveSendOperatorChecklistReport,
      monitorState: null,
      approvedMappingsCount: 3,
      bridgeFlagEnabled: false,
      auditLogPresent: true,
      lastAudit: null,
    });

    const alert = alerts.find((entry) => entry.type === "live_flag_enabled_without_operator_go");
    assert.equal(alert?.active, true);
    assert.equal(alert?.severity, "critical");
  });

  it("health summary uses dryRun report metrics without sends", () => {
    const health = buildRunnerHealthSummary({
      config: {
        scheduleEnabled: false,
        defaultMode: "dryRun",
        liveEngineMode: null,
        fullReconciliationDaily: false,
      },
      state: baseState,
      paperworkReport: baseReport,
      lastAudit: { sendsThisRun: 0 },
    });

    assert.equal(health.currentMode, "disabled");
    assert.equal(health.lastRunResult, "never_run");
    assert.equal(health.candidatesEvaluated, 10);
    assert.equal(health.readyToSend, 2);
  });
});
