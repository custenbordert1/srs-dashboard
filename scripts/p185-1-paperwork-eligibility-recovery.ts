/**
 * P185.1 — Paperwork eligibility recovery + corrected dry-run.
 * Does not enable live sending.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatP1851Markdown,
  P1851_SECRET_SETUP_DOC,
  runP1851PaperworkEligibilityRecovery,
} from "../src/lib/p185-1-paperwork-eligibility-recovery";

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const skipEnvelope = process.argv.includes("--skip-envelope-network");

  const result = await runP1851PaperworkEligibilityRecovery({
    beforeUnmatchedJobs: 528,
    beforeEligible: 0,
    skipEnvelopeReconcile: skipEnvelope,
    forceDurableLocal: true,
  });

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });

  const publicReport = {
    ...result.report,
    // ensure no operator PII leaked
  };
  await writeFile(
    path.join(artifactsDir, "p185-1-paperwork-eligibility-recovery.json"),
    `${JSON.stringify(publicReport, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactsDir, "p185-1-paperwork-eligibility-recovery.md"),
    formatP1851Markdown(result.report),
    "utf8",
  );

  const mappingPublic = {
    generatedAt: result.report.generatedAt,
    coverage: result.report.mappingCoverage,
    methodCounts: result.mappingRows.reduce(
      (acc, row) => {
        acc[row.mappingMethod] = (acc[row.mappingMethod] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    unresolvedSampleCandidateIds: result.mappingRows
      .filter((r) => r.mappingMethod === "unresolved")
      .slice(0, 25)
      .map((r) => r.candidateId),
    rows: result.mappingRows.map((r) => ({
      candidateId: r.candidateId,
      originalPositionId: r.originalPositionId,
      resolvedPositionId: r.resolvedPositionId,
      mappingMethod: r.mappingMethod,
      confidence: r.confidence,
      ambiguity: r.ambiguity,
      jobOpen: r.jobOpen,
      jobAcceptingCandidates: r.jobAcceptingCandidates,
      onboardingJobClassification: r.onboardingJobClassification,
    })),
  };
  await writeFile(
    path.join(artifactsDir, "p185-1-job-mapping-report.json"),
    `${JSON.stringify(mappingPublic, null, 2)}\n`,
    "utf8",
  );

  const envelopePublic = {
    generatedAt: result.report.generatedAt,
    summary: result.report.envelopeReconciliation,
    rows: result.envelopeRows.map((r) => ({
      candidateId: r.candidateId,
      envelopeId: r.envelopeId,
      lifecycle: r.lifecycle,
      replacementEligible: r.replacementEligible,
      replacementReason: r.replacementReason,
      error: r.error,
      // no signing URLs
    })),
  };
  await writeFile(
    path.join(artifactsDir, "p185-1-envelope-reconciliation.json"),
    `${JSON.stringify(envelopePublic, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    path.join(artifactsDir, "p185-1-secret-setup.md"),
    `${P1851_SECRET_SETUP_DOC}\n`,
    "utf8",
  );

  // Secured local operator review (under .data — not for general artifacts)
  const dataDir = process.env.SRS_RECRUITING_DATA_DIR || path.join(process.cwd(), ".data");
  await mkdir(dataDir, { recursive: true });
  const byBucket = {
    A_ready_to_send: result.operatorReview.filter((r) => r.bucket === "A"),
    B_replacement_review: result.operatorReview.filter((r) => r.bucket === "B"),
    C_awaiting_hiring_approval: result.operatorReview.filter((r) => r.bucket === "C"),
    D_job_mapping_unresolved: result.operatorReview.filter((r) => r.bucket === "D"),
    E_already_sent_or_completed: result.operatorReview.filter((r) => r.bucket === "E"),
    F_no_paperwork_action: result.operatorReview.filter((r) => r.bucket === "F"),
  };
  await writeFile(
    path.join(dataDir, "p185-1-operator-review-local.json"),
    `${JSON.stringify({ generatedAt: result.report.generatedAt, byBucket, stageInventory: result.stageInventory }, null, 2)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        liveReady: result.report.liveReady,
        comparison: result.report.comparison,
        classifications: result.report.classifications,
        mappingCoverage: result.report.mappingCoverage,
        envelope: result.report.envelopeReconciliation,
        dryRun: {
          evaluated: result.report.dryRun.evaluated,
          eligible: result.report.dryRun.eligible,
          queueDepth: result.report.dryRun.queueDepth,
          estimatedClearanceMinutes: result.report.dryRun.estimatedClearanceMinutes,
        },
        liveBlockers: result.report.liveBlockers,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
