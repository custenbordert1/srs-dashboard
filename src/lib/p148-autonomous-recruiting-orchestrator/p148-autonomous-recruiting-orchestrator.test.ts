import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  isAutonomousRecruitingEnabled,
  tryAcquireOrchestratorLock,
  releaseOrchestratorLock,
  loadOrchestratorState,
} from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";
import {
  buildOrchestratorStatusSnapshot,
  isAutonomousRecruitingEnabled as isEnabledFromEngine,
} from "@/lib/recruiting/autonomous-recruiting-orchestrator";

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

describe("p148-autonomous-recruiting-orchestrator", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("defaults orchestrator to disabled", () => {
    setEnv("AUTONOMOUS_RECRUITING_ENABLED", undefined);
    assert.equal(isAutonomousRecruitingEnabled(), false);
    assert.equal(isEnabledFromEngine(), false);
  });

  it("prevents overlapping runs via lock", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p148-lock-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_RECRUITING_ENABLED", "false");

    const first = await tryAcquireOrchestratorLock({ dryRun: true, phase: "refresh_live_snapshot" });
    assert.equal(first.acquired, true);

    const second = await tryAcquireOrchestratorLock({ dryRun: true, phase: "refresh_live_snapshot" });
    assert.equal(second.acquired, false);

    await releaseOrchestratorLock({
      runId: first.runId,
      success: true,
      durationMs: 10,
    });

    const third = await tryAcquireOrchestratorLock({ dryRun: true });
    assert.equal(third.acquired, true);
    await releaseOrchestratorLock({
      runId: third.runId,
      success: true,
      durationMs: 5,
    });

    const state = await loadOrchestratorState();
    assert.equal(state.executeBatchCalled, false);
    assert.equal(state.processingLock, null);
  });

  it("builds status snapshot with safety flags", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p148-status-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_RECRUITING_ENABLED", "false");

    const status = await buildOrchestratorStatusSnapshot();
    assert.equal(status.sourcePhase, "P148");
    assert.equal(status.enabled, false);
    assert.equal(status.dryRunOnly, true);
    assert.equal(status.breezyWrites, false);
    assert.equal(status.executeBatchCalled, false);
  });
});
