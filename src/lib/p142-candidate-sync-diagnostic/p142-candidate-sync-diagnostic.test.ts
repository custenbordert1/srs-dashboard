import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCandidateSyncDiagnostic } from "@/lib/p142-candidate-sync-diagnostic/build-candidate-sync-diagnostic";
import { P142_DIAGNOSTIC_MODE, P142_SOURCE_PHASE } from "@/lib/p142-candidate-sync-diagnostic/types";

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

describe("p142-candidate-sync-diagnostic", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("diagnoses architecture split when ingestion has candidates but live snapshot skipped", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p142-diag-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const store = {
      version: 1 as const,
      runId: "run-1",
      publishedPositionIds: ["pos-1"],
      publishedPositionsTotal: 2,
      scannedPositionIds: ["pos-1"],
      checkpointIndex: 1,
      candidates: {
        "c-1": {
          candidateId: "c-1",
          firstName: "Test",
          lastName: "User",
          email: "test@example.com",
          positionId: "pos-1",
          stage: "applied",
          appliedDate: "2026-07-01T00:00:00.000Z",
        },
      },
      lastJobListAt: "2026-07-01T00:00:00.000Z",
      lastChunkAt: "2026-07-01T00:00:00.000Z",
      lastFullCycleAt: null,
      cycleComplete: false,
      chunksThisRun: 1,
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    await writeFile(
      path.join(tempDir, "candidate-ingestion.json"),
      `${JSON.stringify(store, null, 2)}\n`,
      "utf8",
    );

    const report = await buildCandidateSyncDiagnostic({ skipLiveBreezyFetch: true });

    assert.equal(report.sourcePhase, P142_SOURCE_PHASE);
    assert.equal(report.mode, P142_DIAGNOSTIC_MODE);
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.ingestionStore.candidateCount, 1);
    assert.equal(report.ingestionStore.usableForPaperwork, true);
    assert.equal(report.paperworkCandidateSource.sameAsCommandCenterKpi, false);
    assert.ok(report.rootCause.toLowerCase().includes("ingestion"));
    assert.ok(report.exactFailingComponent.includes("recruiting-live-snapshot"));
    assert.equal(report.issueClassification, "architecture_split");
    assert.ok(report.opsComponents.some((c) => c.phase === "P126" && c.uiVisible));
    assert.ok(report.opsComponents.some((c) => c.phase === "P140" && c.apiRouteExists));
    assert.equal(report.liveSnapshot.candidatesPulled, null);
  });

  it("never enables live mode or calls executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p142-safety-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const report = await buildCandidateSyncDiagnostic({ skipLiveBreezyFetch: true });

    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.liveModeEnabled, false);
  });
});
