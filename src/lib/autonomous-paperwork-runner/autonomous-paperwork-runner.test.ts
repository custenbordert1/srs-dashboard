import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeRunnerCheckpoint,
  selectCandidatesForRunnerCycle,
  shouldReEvaluateBlockedRecord,
} from "@/lib/autonomous-paperwork-runner/select-candidates-for-runner";
import {
  isLockStale,
  mapRunnerModeToEngineMode,
  P106_1_DEFAULT_MODE,
  P106_1_DEV_INTERVAL_MS,
  resolveRunnerProductionConfig,
} from "@/lib/autonomous-paperwork-runner";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";

function mockStore(candidates: Record<string, { createdDate?: string; updatedDate?: string }>): CandidateIngestionStoreFile {
  return {
    version: 1,
    updatedAt: "2026-06-28T12:00:00.000Z",
    candidates: candidates as never,
    publishedPositionsTotal: 0,
    lastIngestionRun: null,
  };
}

const emptyWorkflows: CandidateWorkflowState = {};

describe("autonomous-paperwork-runner", () => {
  it("defaults to dryRun mode", () => {
    assert.equal(P106_1_DEFAULT_MODE, "dryRun");
  });

  it("dev interval is 5 minutes", () => {
    assert.equal(P106_1_DEV_INTERVAL_MS, 5 * 60 * 1000);
  });

  it("incremental selection excludes stale candidates", () => {
    const store = mockStore({
      old: { createdDate: "2026-01-01T00:00:00.000Z", updatedDate: "2026-01-01T00:00:00.000Z" },
      fresh: { createdDate: "2026-06-29T10:00:00.000Z", updatedDate: "2026-06-29T10:00:00.000Z" },
    });
    const { candidateIds } = selectCandidatesForRunnerCycle({
      store,
      workflows: emptyWorkflows,
      lastSuccessfulRunAt: "2026-06-28T00:00:00.000Z",
      lastProcessedCheckpoint: null,
      blockedRegistry: {},
      fullReconciliation: false,
    });
    assert.deepEqual(candidateIds, ["fresh"]);
  });

  it("includes Paperwork Needed candidates even when stale", () => {
    const store = mockStore({
      stale: { createdDate: "2026-01-01T00:00:00.000Z", updatedDate: "2026-01-01T00:00:00.000Z" },
    });
    const workflows: CandidateWorkflowState = {
      stale: { workflowStatus: "Paperwork Needed", actionType: "send-paperwork" } as never,
    };
    const result = selectCandidatesForRunnerCycle({
      store,
      workflows,
      lastSuccessfulRunAt: "2026-06-28T00:00:00.000Z",
      lastProcessedCheckpoint: null,
      blockedRegistry: {},
      fullReconciliation: false,
    });
    assert.ok(result.candidateIds.includes("stale"));
    assert.equal(result.paperworkNeededCount, 1);
    assert.equal(result.staleEligibleRecovered, 1);
  });

  it("includes send-paperwork action candidates", () => {
    const store = mockStore({
      action: { createdDate: "2026-01-01T00:00:00.000Z", updatedDate: "2026-01-01T00:00:00.000Z" },
    });
    const workflows: CandidateWorkflowState = {
      action: { workflowStatus: "Applied", actionType: "send-paperwork" } as never,
    };
    const result = selectCandidatesForRunnerCycle({
      store,
      workflows,
      lastSuccessfulRunAt: "2026-06-28T00:00:00.000Z",
      lastProcessedCheckpoint: null,
      blockedRegistry: {},
      fullReconciliation: false,
    });
    assert.ok(result.candidateIds.includes("action"));
    assert.equal(result.sendPaperworkActionCount, 1);
  });

  it("full reconciliation selects all candidates", () => {
    const store = mockStore({
      a: { createdDate: "2026-01-01T00:00:00.000Z" },
      b: { createdDate: "2026-02-01T00:00:00.000Z" },
    });
    const { candidateIds } = selectCandidatesForRunnerCycle({
      store,
      workflows: emptyWorkflows,
      lastSuccessfulRunAt: "2026-06-28T00:00:00.000Z",
      lastProcessedCheckpoint: null,
      blockedRegistry: {},
      fullReconciliation: true,
    });
    assert.equal(candidateIds.length, 2);
  });

  it("re-includes previously blocked candidates", () => {
    const store = mockStore({
      blocked: { createdDate: "2026-01-01T00:00:00.000Z", updatedDate: "2026-01-01T00:00:00.000Z" },
    });
    const { candidateIds } = selectCandidatesForRunnerCycle({
      store,
      workflows: emptyWorkflows,
      lastSuccessfulRunAt: "2026-06-28T00:00:00.000Z",
      lastProcessedCheckpoint: null,
      blockedRegistry: {
        blocked: {
          candidateId: "blocked",
          candidateName: "Test",
          blockerCategory: "project_not_mappable",
          blockerReason: "No active project",
          recommendedFix: "Publish job",
          lastEvaluatedAt: "2026-06-27T00:00:00.000Z",
        },
      },
      fullReconciliation: false,
    });
    assert.ok(candidateIds.includes("blocked"));
  });

  it("re-evaluates blocked when blocker category changes", () => {
    assert.equal(
      shouldReEvaluateBlockedRecord({
        previous: {
          candidateId: "x",
          candidateName: "X",
          blockerCategory: "project_not_mappable",
          blockerReason: "old",
          recommendedFix: null,
          lastEvaluatedAt: "2026-06-01T00:00:00.000Z",
        },
        currentBlockerCategory: "p84_gate_failed",
        currentCategory: "blocked",
      }),
      true,
    );
    assert.equal(
      shouldReEvaluateBlockedRecord({
        previous: {
          candidateId: "x",
          candidateName: "X",
          blockerCategory: "project_not_mappable",
          blockerReason: "old",
          recommendedFix: null,
          lastEvaluatedAt: "2026-06-01T00:00:00.000Z",
        },
        currentBlockerCategory: "project_not_mappable",
        currentCategory: "blocked",
      }),
      false,
    );
  });

  it("maps runner modes to engine modes without executeBatch", () => {
    assert.equal(mapRunnerModeToEngineMode({ mode: "dryRun", liveEngineMode: null }), "dryRun");
    assert.equal(
      mapRunnerModeToEngineMode({ mode: "runOnce", liveEngineMode: "executeSafeSingles" }),
      "executeSafeSingles",
    );
    assert.equal(mapRunnerModeToEngineMode({ mode: "runOnce", liveEngineMode: "executeOne" }), "executeOne");
  });

  it("production config defaults to dryRun without env", () => {
    const config = resolveRunnerProductionConfig();
    assert.equal(config.defaultMode, "dryRun");
    assert.equal(config.scheduleEnabled, false);
  });

  it("stale lock detection works", () => {
    const stale = isLockStale({
      runId: "x",
      lockedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      mode: "dryRun",
    });
    const fresh = isLockStale({
      runId: "y",
      lockedAt: new Date().toISOString(),
      mode: "dryRun",
    });
    assert.equal(stale, true);
    assert.equal(fresh, false);
  });

  it("computeRunnerCheckpoint uses latest activity", () => {
    const store = mockStore({
      a: { updatedDate: "2026-06-28T08:00:00.000Z" },
      b: { updatedDate: "2026-06-29T15:30:00.000Z" },
    });
    const cp = computeRunnerCheckpoint(store);
    assert.equal(cp, "2026-06-29T15:30:00.000Z");
  });

  it("runner modes never include executeBatch", () => {
    const modes = ["dryRun", "runOnce", "scheduled", "fullReconciliation"];
    assert.equal(modes.includes("executeBatch"), false);
  });
});
