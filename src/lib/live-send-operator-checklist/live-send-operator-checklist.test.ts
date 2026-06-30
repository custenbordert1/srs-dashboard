import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildLiveSendOperatorChecklist } from "@/lib/live-send-operator-checklist/build-live-send-operator-checklist";

const envBackup: Record<string, string | undefined> = {};
let tempDir = "";

function setEnv(key: string, value: string): void {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  process.env[key] = value;
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

describe("live-send-operator-checklist (P101)", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("returns NO-GO when prerequisites are missing without sending paperwork", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p101-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);

    const report = await buildLiveSendOperatorChecklist({ mtdOnly: false });
    assert.equal(report.goNoGo, "NO-GO");
    assert.ok(report.checklist.length >= 10);
    assert.ok(report.remainingActionsBeforeExecuteOne.length > 0);
    assert.equal(report.metrics.liveSend, false);
  });
});
