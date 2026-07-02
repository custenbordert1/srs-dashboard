import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildProductionReadinessCertification } from "@/lib/p141-production-readiness-certification/build-production-readiness-certification";
import { formatCertificationMarkdown } from "@/lib/p141-production-readiness-certification/format-certification-markdown";
import { P141_CERTIFICATION_MODE, P141_SOURCE_PHASE } from "@/lib/p141-production-readiness-certification/types";

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

describe("p141-production-readiness-certification", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("certifies P122–P140 subsystems in audit-only mode", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p141-cert-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    delete process.env.DROPBOX_SIGN_API_KEY;

    const report = await buildProductionReadinessCertification({
      skipP127Drill: true,
      skipHistoryAppend: true,
    });

    assert.equal(report.sourcePhase, P141_SOURCE_PHASE);
    assert.equal(report.mode, P141_CERTIFICATION_MODE);
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);

    const phases = report.subsystemCertifications.map((c) => c.phase);
    assert.equal(phases.length, 19);
    assert.deepEqual(phases, [
      "P122",
      "P123",
      "P124",
      "P125",
      "P126",
      "P127",
      "P128",
      "P129",
      "P130",
      "P131",
      "P132",
      "P133",
      "P134",
      "P135",
      "P136",
      "P137",
      "P138",
      "P139",
      "P140",
    ]);

    assert.ok(report.safetyVerifications.length >= 10);
    assert.ok(report.productionReadinessScore >= 0 && report.productionReadinessScore <= 100);
    assert.ok(
      ["NOT READY", "READY WITH CONDITIONS", "READY FOR FIRST LIVE PILOT"].includes(report.finalRecommendation),
    );
    assert.equal(report.dryRunSimulation.executeBatchCalled, false);
    assert.equal(report.dryRunSimulation.paperworkSent, false);
    assert.equal(report.dryRunSimulation.breezyWrites, false);
    assert.ok(report.requiredManualOperatorActions.length > 0);
    assert.ok(report.suggestedImprovements.length > 0);

    const markdown = formatCertificationMarkdown(report);
    assert.ok(markdown.includes("P141 — Production Readiness"));
    assert.ok(markdown.includes(report.finalRecommendation));
  });

  it("never sends paperwork or calls executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p141-safety-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const report = await buildProductionReadinessCertification({
      skipP127Drill: true,
      skipHistoryAppend: true,
    });

    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.breezyWrites, false);
    for (const cert of report.subsystemCertifications) {
      assert.equal(cert.executeBatchCalled, false);
    }
    const batchCheck = report.safetyVerifications.find((s) => s.id === "execute_batch_unreachable");
    assert.ok(batchCheck?.passed);
  });
});
