/**
 * P132 — Resume Detection Investigation
 * Usage: npx tsx scripts/p132-resume-detection-investigation.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildResumeDetectionInvestigation } from "@/lib/p132-resume-detection-investigation";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const report = await buildResumeDetectionInvestigation();
  const artifactPath = path.join(process.cwd(), "artifacts", "p132-resume-detection-investigation.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    targetCandidateId: report.targetCandidateId,
    targetCandidateName: report.targetCandidateName,
    hasResumeCalculationSites: report.hasResumeCalculationSites,
    storedIngestionRecord: report.storedIngestionRecord,
    breezyRawPayload: report.breezyRawPayload,
    resumeSourceFindings: report.resumeSourceFindings,
    parserComparison: report.parserComparison,
    rootCause: report.rootCause,
    remediation: report.remediation,
    postFixSimulation: report.postFixSimulation,
    p131Recheck: report.p131Recheck
      ? {
          verification: report.p131Recheck.verification,
          autoApproved: report.p131Recheck.autoApproved,
          approvalScore: report.p131Recheck.approvalScore,
          goNoGo: report.p131Recheck.goNoGo,
        }
      : null,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    executeBatchCalled: report.executeBatchCalled,
    breezyWrites: report.breezyWrites,
    liveModeEnabled: report.liveModeEnabled,
    paperworkSent: report.paperworkSent,
  };

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        storedHasResume: report.storedIngestionRecord.hasResume,
        fixedHasResume: report.parserComparison.fixedRuleResult,
        resumeAssetsDetected: report.parserComparison.resumeAssetsDetected,
        primaryResumeSource: report.resumeSourceFindings.primaryResumeSource,
        goNoGo: report.goNoGo,
        executeBatchCalled: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
