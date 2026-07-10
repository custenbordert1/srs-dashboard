import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildProductionHealthReport } from "@/lib/p140-production-rollout-health-monitoring/build-production-health-report";
import { computeTrend } from "@/lib/p140-production-rollout-health-monitoring/health-history-store";

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

describe("p140-production-rollout-health-monitoring", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("computes queue and retry trends", () => {
    assert.equal(computeTrend(5, 3), "growing");
    assert.equal(computeTrend(2, 5), "shrinking");
    assert.equal(computeTrend(4, 4), "stable");
    assert.equal(computeTrend(1, null), "unknown");
  });

  it("builds production health report in read-only mode", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p140-health-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    delete process.env.DROPBOX_SIGN_API_KEY;

    const report = await buildProductionHealthReport({ skipHistoryAppend: true });

    assert.equal(report.sourcePhase, "P140");
    assert.equal(report.mode, "readOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);
    assert.ok(["PASS", "WARNING", "CRITICAL"].includes(report.overallResult));
    assert.ok(report.overallHealthScore >= 0 && report.overallHealthScore <= 100);
    assert.ok(report.componentStatuses.length >= 10);

    const componentIds = report.componentStatuses.map((c) => c.id);
    assert.ok(componentIds.includes("p136_scheduler"));
    assert.ok(componentIds.includes("p124_approval_engine"));
    assert.ok(componentIds.includes("p123_orchestrator"));
    assert.ok(componentIds.includes("p135_remediation_executor"));
    assert.ok(componentIds.includes("p125_runner"));
    assert.ok(componentIds.includes("p126_ops_command_center"));
    assert.ok(componentIds.includes("dropbox_sign"));
    assert.ok(componentIds.includes("p138_pilot_lock"));

    const dropbox = report.componentStatuses.find((c) => c.id === "dropbox_sign");
    assert.equal(dropbox?.status, "Critical");

    assert.ok(report.activeAlerts.some((a) => a.id === "dropbox_unavailable"));
    assert.ok(report.executivePanel.overallHealthScore === report.overallHealthScore);
    assert.ok(report.recommendations.length > 0);
  });

  it("never sends paperwork or calls executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p140-safety-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("DROPBOX_SIGN_API_KEY", "test-key-placeholder");

    const report = await buildProductionHealthReport({ skipHistoryAppend: true });
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.breezyWrites, false);
  });
});
