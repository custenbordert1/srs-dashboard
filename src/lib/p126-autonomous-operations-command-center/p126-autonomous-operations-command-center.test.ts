import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildOperationsCommandCenterReport } from "@/lib/p126-autonomous-operations-command-center/build-operations-command-center-report";
import {
  filterActivityTimeline,
  filterCandidateSummaries,
} from "@/lib/p126-autonomous-operations-command-center/filter-operations-data";
import type { ActivityTimelineEntry } from "@/lib/p126-autonomous-operations-command-center/types";

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

describe("p126-autonomous-operations-command-center", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("builds operations command center report with safety confirmation", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p126-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const report = await buildOperationsCommandCenterReport({ filters: { timeRange: "all" } });
    assert.equal(report.sourcePhase, "P126");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.safetyConfirmation.executeOneOnly, true);
    assert.equal(report.safetyConfirmation.noBypassControls, true);
    assert.ok(report.runner);
    assert.ok(report.queue);
    assert.ok(report.health);
    assert.ok(Array.isArray(report.timeline));
  });

  it("filters timeline by errors only", () => {
    const entries: ActivityTimelineEntry[] = [
      {
        auditId: "1",
        at: new Date().toISOString(),
        candidateId: "c1",
        candidateName: "Alex",
        action: "cycle",
        result: "failed",
        durationMs: 100,
        reason: "network timeout",
        source: "p125-runner",
      },
      {
        auditId: "2",
        at: new Date().toISOString(),
        candidateId: "c2",
        candidateName: "Bob",
        action: "cycle",
        result: "sent",
        durationMs: 200,
        reason: null,
        source: "p125-runner",
      },
    ];

    const filtered = filterActivityTimeline(entries, { errorsOnly: true, timeRange: "all" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.candidateId, "c1");
  });

  it("filters candidates by approval decision", () => {
    const candidates = [
      {
        candidateId: "c1",
        candidateName: "Alex",
        email: "a@example.com",
        approvalDecision: "AUTO_APPROVED",
        eligibilityStatus: "READY_TO_SEND",
      },
      {
        candidateId: "c2",
        candidateName: "Bob",
        email: "b@example.com",
        approvalDecision: "BLOCKED",
        eligibilityStatus: "BLOCKED",
      },
    ];

    const filtered = filterCandidateSummaries(candidates, { approvalDecision: "AUTO_APPROVED" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.candidateId, "c1");
  });

  it("does not expose executeBatch in report contract", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p126-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    const report = await buildOperationsCommandCenterReport();
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.safetyConfirmation.p122GatesPreserved, true);
    assert.equal(report.safetyConfirmation.p124ApprovalPreserved, true);
  });
});
