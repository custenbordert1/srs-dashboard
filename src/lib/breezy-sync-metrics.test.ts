import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  BREEZY_SYNC_WATCHDOG_DEGRADED_MS,
  BREEZY_SYNC_WATCHDOG_TIMEOUT_MS,
  BREEZY_SYNC_WATCHDOG_WARNING_MS,
  beginBreezySyncPhase,
  beginBreezySyncRun,
  endBreezySyncPhase,
  endBreezySyncRun,
  evaluateSyncWatchdog,
  getBreezySyncMetricsSnapshot,
  isBreezySyncPipelineActive,
  runBreezySyncPipeline,
} from "@/lib/breezy-sync-metrics";

describe("breezy sync metrics", () => {
  afterEach(() => {
    endBreezySyncRun();
  });

  it("evaluates watchdog thresholds", () => {
    assert.equal(evaluateSyncWatchdog(5_000, "preview").level, "ok");
    assert.equal(evaluateSyncWatchdog(BREEZY_SYNC_WATCHDOG_WARNING_MS, "preview").level, "warning");
    assert.match(evaluateSyncWatchdog(BREEZY_SYNC_WATCHDOG_WARNING_MS, "preview").message ?? "", /slower than expected/i);
    assert.equal(evaluateSyncWatchdog(BREEZY_SYNC_WATCHDOG_DEGRADED_MS, "fast-tier").level, "degraded");
    assert.equal(evaluateSyncWatchdog(BREEZY_SYNC_WATCHDOG_TIMEOUT_MS, "fast-tier").level, "timeout");
  });

  it("records phase durations and candidate counts", () => {
    beginBreezySyncRun({ cacheRestored: true });
    beginBreezySyncPhase("preview");
    endBreezySyncPhase("preview", { candidateCount: 42, liveHit: true, cacheHit: false });
    const snapshot = getBreezySyncMetricsSnapshot();
    assert.equal(snapshot.phases.preview.candidateCount, 42);
    assert.equal(snapshot.phases.preview.liveHit, true);
    assert.equal(snapshot.cacheRestored, true);
    assert.ok(snapshot.completedPhases.includes("preview"));
  });

  it("dedupes concurrent sync pipelines per tab", async () => {
    let runs = 0;
    const first = runBreezySyncPipeline(async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    assert.equal(isBreezySyncPipelineActive(), true);
    const second = runBreezySyncPipeline(async () => {
      runs += 1;
    });
    await Promise.all([first, second]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(runs, 1);
    assert.equal(isBreezySyncPipelineActive(), false);
  });
});
