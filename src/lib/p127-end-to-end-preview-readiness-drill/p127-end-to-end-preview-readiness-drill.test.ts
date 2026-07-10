import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runEndToEndPreviewReadinessDrill } from "@/lib/p127-end-to-end-preview-readiness-drill/run-preview-readiness-drill";

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

describe("p127-end-to-end-preview-readiness-drill", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("runs full preview drill without sending paperwork", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p127-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "false");
    setEnv("AUTONOMOUS_PAPERWORK_OPERATOR_GO", "false");

    const report = await runEndToEndPreviewReadinessDrill();
    assert.equal(report.sourcePhase, "P127");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);
    assert.ok(["GO", "GO WITH CONDITIONS", "NO-GO"].includes(report.goNoGo));
    assert.equal(report.drillSteps.length, 10);
    assert.ok(report.validations.approvalEngine);
    assert.ok(report.validations.duplicatePrevention);
    assert.ok(report.remainingStepsBeforeFirstLiveSend.length > 0);
  });

  it("never uses executeBatch in runner preview path", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p127-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const report = await runEndToEndPreviewReadinessDrill();
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.validations.runnerOneCyclePreview !== "FAIL", true);
  });

  it("includes safety gates from P122 and P123", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p127-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const report = await runEndToEndPreviewReadinessDrill();
    assert.ok(report.safetyGates.length > 0);
    assert.ok(typeof report.totalCandidatesEvaluated === "number");
  });
});
