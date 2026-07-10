import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildAutonomousRecruitingProductionReadiness } from "@/lib/p149-autonomous-recruiting-production-readiness/build-autonomous-recruiting-production-readiness";
import { searchObservabilityHistory } from "@/lib/p149-autonomous-recruiting-production-readiness/build-observability-timeline";
import { formatProductionReadinessMarkdown } from "@/lib/p149-autonomous-recruiting-production-readiness/format-production-readiness-markdown";
import { isAutonomousRecruitingEnabled } from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";

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

const session = {
  userId: "p149-test",
  email: "test@local",
  name: "P149 Test",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

describe("p149-autonomous-recruiting-production-readiness", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("defaults orchestrator to disabled", () => {
    setEnv("AUTONOMOUS_RECRUITING_ENABLED", undefined);
    assert.equal(isAutonomousRecruitingEnabled(), false);
  });

  it("builds production readiness report with safety flags", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p149-report-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_RECRUITING_ENABLED", "false");
    setEnv("P146_AUTO_SEND_PAPERWORK_REMINDERS_ENABLED", "false");
    setEnv("P147_INITIAL_PAPERWORK_AUTO_SEND_ENABLED", "false");

    const report = await buildAutonomousRecruitingProductionReadiness({
      session,
      skipLiveDryRun: true,
    });

    assert.equal(report.sourcePhase, "P149");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);
    assert.ok(report.subsystemValidations.length >= 6);
    assert.equal(report.e2eWorkflowTransitions.length, 8);
    assert.ok(report.goLiveChecklist.length >= 5);
    assert.ok(report.productionReadinessScore >= 0);
    assert.ok(["NOT READY", "GO LIVE WITH CONDITIONS", "GO LIVE"].includes(report.finalRecommendation));

    const md = formatProductionReadinessMarkdown(report);
    assert.ok(md.includes("P149"));
    assert.ok(md.includes(report.finalRecommendation));
  });

  it("searches observability history", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p149-obs-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const result = await searchObservabilityHistory({ limit: 10 });
    assert.equal(result.sourcePhase, "P149");
    assert.ok(Array.isArray(result.entries));
  });
});
