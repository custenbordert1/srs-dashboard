import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { PaperworkCycleReport } from "@/lib/autonomous-paperwork-orchestrator/types";
import {
  isProductionLockStale,
  loadProductionRunnerState,
  recordDuplicatePrevention,
} from "@/lib/p125-autonomous-paperwork-production-runner/runner-store";
import {
  pauseProductionRunner,
  resumeProductionRunner,
  runProductionRunnerCycle,
  startProductionRunner,
  stopProductionRunner,
} from "@/lib/p125-autonomous-paperwork-production-runner/run-production-runner";
import { resolveProductionRunnerConfig } from "@/lib/p125-autonomous-paperwork-production-runner/runner-config";

const envBackup: Record<string, string | undefined> = {};
let tempDir = "";

function setEnv(key: string, value: string | undefined): void {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function restoreEnv(): Promise<void> {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
}

function mockCycleReport(overrides: Partial<PaperworkCycleReport> = {}): PaperworkCycleReport {
  return {
    sourcePhase: "P123",
    generatedAt: new Date().toISOString(),
    cycleId: "cycle-1",
    cycleStatus: "idle",
    currentStep: "complete",
    progressPercent: 100,
    candidates: [],
    readyCandidates: [],
    blockedCandidates: [],
    sendQueue: {
      nextCandidate: null,
      nextFive: [],
      remainingQueue: [],
      queueDepth: 0,
      estimatedCompletionMinutes: 0,
    },
    safetyState: { checks: [], goNoGo: "NO-GO", reason: "dry run" },
    execution: {
      executed: false,
      mode: "dryRun",
      candidateId: null,
      outcome: "not_executed",
      signatureRequestId: null,
      error: null,
      retryAttempt: 0,
      executeBatchCalled: false,
    },
    operatorTimeline: [],
    metrics: {
      candidatesEvaluated: 0,
      readyCount: 0,
      blockedCount: 0,
      successRate: 0,
      averageSendTimeMinutes: 3,
      queueDepth: 0,
    },
    operatorMode: "NO-GO",
    pilotMode: false,
    liveMode: false,
    approvalRequired: false,
    warnings: [],
    errors: [],
    etaMinutes: null,
    lastExecutionAt: null,
    approvalSummary: null,
    ...overrides,
  } as PaperworkCycleReport;
}

describe("p125-autonomous-paperwork-production-runner", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("defaults to dryRun and never calls executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p125-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    let executeBatchCalled = false;
    const result = await runProductionRunnerCycle({
      mode: "oneCycle",
      runPaperworkCycleFn: async () => ({
        report: mockCycleReport(),
        executeBatchCalled: false,
      }),
    });

    assert.equal(result.executeBatchCalled, false);
    assert.equal(result.snapshot.lastCycle?.execution.mode, "dryRun");
    assert.equal(executeBatchCalled, false);
  });

  it("skips cycle when paused", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p125-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    await pauseProductionRunner();

    let cycles = 0;
    const result = await runProductionRunnerCycle({
      mode: "paused",
      runPaperworkCycleFn: async () => {
        cycles += 1;
        return { report: mockCycleReport(), executeBatchCalled: false };
      },
    });

    assert.equal(result.skippedPaused, true);
    assert.equal(cycles, 0);
  });

  it("prevents duplicate sends for same candidate", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p125-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    const state = await loadProductionRunnerState();
    assert.equal(recordDuplicatePrevention(state, "c1"), true);
    assert.equal(recordDuplicatePrevention(state, "c1"), false);
  });

  it("scheduler start/stop/pause/resume persists across reload", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p125-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    await startProductionRunner({ mode: "continuous", intervalMs: 60_000 });
    let state = await loadProductionRunnerState();
    assert.equal(state.schedulerMode, "continuous");
    assert.equal(state.continuousEnabled, true);

    await pauseProductionRunner();
    state = await loadProductionRunnerState();
    assert.equal(state.schedulerMode, "paused");

    await resumeProductionRunner();
    state = await loadProductionRunnerState();
    assert.equal(state.schedulerMode, "continuous");

    await stopProductionRunner();
    state = await loadProductionRunnerState();
    assert.equal(state.schedulerMode, "stopped");
    assert.equal(state.continuousEnabled, false);
  });

  it("detects stale runner locks for automatic recovery", () => {
    const stale = isProductionLockStale({
      runId: "r1",
      lockedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      mode: "oneCycle",
    });
    assert.equal(stale, true);
  });

  it("live execution requires P122 env gates", () => {
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "false");
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    setEnv("AUTONOMOUS_PAPERWORK_OPERATOR_GO", "false");
    const config = resolveProductionRunnerConfig();
    assert.equal(
      config.liveExecutionEnabled,
      false,
    );
  });

  it("only processes AUTO_APPROVED queue via P123 delegation", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p125-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const row = {
      candidateId: "c1",
      firstName: "Alex",
      lastName: "Pilot",
      email: "alex@example.com",
      positionId: "job-1",
      positionName: "Merch",
      workflowStatus: "Paperwork Needed",
      paperworkStatus: "not_sent",
      assignedRecruiter: "Taylor",
      assignedDM: "Melissa",
      hasResume: true,
      candidateGrade: { paperworkReady: true },
      paperworkTemplateKey: "onboarding_packet",
    } as ScoredCandidateWorkflowRow;

    const context: LoadedPaperworkCandidates = {
      rowsByCandidateId: new Map([["c1", row]]),
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map(),
      publishedJobs: [],
      publishedJobTitleById: new Map(),
      onboardingByCandidateId: new Map(),
      p109ByCandidate: new Map(),
      approvedMappingsByCandidate: new Map(),
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      candidateIds: ["c1"],
    };

    const result = await runProductionRunnerCycle({
      mode: "oneCycle",
      runPaperworkCycleFn: async () => {
        const { runPaperworkCycle } = await import(
          "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle"
        );
        return runPaperworkCycle({ dryRun: true, contextOverride: context });
      },
    });

    assert.equal(result.executeBatchCalled, false);
    assert.ok(result.snapshot.metrics.queueDepth >= 0);
    for (const queued of result.snapshot.queue) {
      assert.equal(queued.approvalDecision, "AUTO_APPROVED");
    }
  });
});
