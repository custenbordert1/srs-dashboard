/**
 * P191 — Controlled 25-candidate Paperwork Needed + P184 live release.
 * Source: p190-pilot-2a6b078b89 / fingerprint 11a81d2a561882378aefa019 only.
 * Per-candidate temporary P184 live; always restore dry_run.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import {
  buildP191ReadinessReportMarkdown,
  executeP191PaperworkReleasePilot,
  forceP184DryRun,
  freezeP191FromP190Cohort,
  newP191Authorization,
  redactCohortForPublic,
  runP191Preflight,
  validateP191Execution,
  P191_REQUIRED_SOURCE_COHORT_ID,
  P191_REQUIRED_SOURCE_FINGERPRINT,
  type P190SourceCohort,
} from "@/lib/p191-paperwork-release-pilot";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

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

const ART = path.join(process.cwd(), "artifacts");

async function loadP190SourceCohort(): Promise<P190SourceCohort> {
  const raw = await readFile(
    path.join(recruitingDataDir(), "p190-frozen-cohort-local.json"),
    "utf8",
  );
  return JSON.parse(raw) as P190SourceCohort;
}

async function main() {
  loadEnvLocal();
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P187_AUTHORITY_ENABLED;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
  delete process.env.CONTINUOUS_AUTOMATION_ENABLED;
  delete process.env.P185_SCHEDULER_ENABLED;
  delete process.env.P184_LIVE_SEND;
  process.env.P184_MODE = "dry_run";

  await mkdir(ART, { recursive: true });
  await safeRecruitingMkdir(recruitingDataDir());
  await forceP184DryRun();

  const source = await loadP190SourceCohort();
  if (source.cohortId !== P191_REQUIRED_SOURCE_COHORT_ID) {
    console.error(
      JSON.stringify({
        aborted: true,
        reason: "Source cohort ID mismatch",
        got: source.cohortId,
        required: P191_REQUIRED_SOURCE_COHORT_ID,
      }),
    );
    process.exit(1);
  }
  if (source.fingerprint !== P191_REQUIRED_SOURCE_FINGERPRINT) {
    console.error(
      JSON.stringify({
        aborted: true,
        reason: "Source fingerprint mismatch",
        got: source.fingerprint,
        required: P191_REQUIRED_SOURCE_FINGERPRINT,
      }),
    );
    process.exit(1);
  }

  const preflight = await runP191Preflight({
    sourceCohortId: source.cohortId,
    sourceFingerprint: source.fingerprint,
    sourceMemberCount: source.members.length,
  });
  await writeFile(
    path.join(ART, "p191-production-preflight.json"),
    `${JSON.stringify(preflight, null, 2)}\n`,
  );
  if (!preflight.ok) {
    console.error(JSON.stringify({ aborted: true, preflight }, null, 2));
    process.exit(1);
  }

  const workflowsObj = await getCandidateWorkflowState();
  const workflowsById = new Map(Object.entries(workflowsObj));
  const cohort = freezeP191FromP190Cohort({ source, workflowsById });

  await writeFile(
    path.join(recruitingDataDir(), "p191-frozen-cohort-local.json"),
    `${JSON.stringify(cohort, null, 2)}\n`,
  );
  await writeFile(
    path.join(ART, "p191-frozen-cohort.json"),
    `${JSON.stringify(redactCohortForPublic(cohort), null, 2)}\n`,
  );

  const ingestion = await readIngestionStore();
  const candidatesById = new Map(
    listIngestedCandidates(ingestion).map((c) => [c.candidateId, c as BreezyCandidate]),
  );

  console.log(
    JSON.stringify(
      {
        phase: "P191",
        sourceCohortId: cohort.sourceCohortId,
        fingerprint: cohort.fingerprint,
        cohortId: cohort.cohortId,
        executingSends: 25,
        previewConfirmedViaPrompt: true,
      },
      null,
      2,
    ),
  );

  const authorization = newP191Authorization({
    cohort,
    authorizedBy: "operator-prompt-p191",
  });

  const result = await executeP191PaperworkReleasePilot({
    cohort,
    authorization,
    candidatesById,
  });

  // Absolute restore
  const finalMode = await forceP184DryRun();

  const afterById = new Map(Object.entries(await getCandidateWorkflowState()));
  const validation = validateP191Execution({
    cohort,
    result: { ...result, finalP184Mode: finalMode },
    workflowsById: afterById,
  });

  const p191Tests = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "src/lib/p191-paperwork-release-pilot/__tests__/p191-paperwork-release-pilot.test.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  const tscAll = spawnSync(
    process.execPath,
    [path.join("node_modules", "typescript", "bin", "tsc"), "--noEmit", "--pretty", "false"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const tscOut = `${tscAll.stdout}\n${tscAll.stderr}`;
  const p191TscErrors = tscOut
    .split("\n")
    .filter((l) => l.includes("p191-paperwork-release-pilot") && l.includes("error TS"));

  const testsStatus =
    p191Tests.status === 0
      ? `pass (p191 exit=${p191Tests.status})`
      : `fail p191 exit=${p191Tests.status}`;
  const buildStatus =
    p191TscErrors.length === 0
      ? "pass for P191 (repo tsc may have unrelated pre-existing errors)"
      : `fail P191 tsc: ${p191TscErrors.slice(0, 3).join(" | ")}`;

  const report = {
    phase: "P191",
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    sourceCohortId: cohort.sourceCohortId,
    sourceFingerprint: cohort.sourceFingerprint,
    attempted: result.attempted,
    successful: result.successful,
    failed: result.failed,
    confirmedDropboxSignSends: result.confirmedDropboxSignSends,
    duplicateEnvelopes: result.duplicateEnvelopes,
    auditEvents: result.auditEvents,
    p186Observations: result.p186Observations,
    finalP184Mode: finalMode,
    automationStatus: result.automationStatus,
    queueRemaining: validation.queueRemaining,
    viewed: result.viewed,
    signed: result.signed,
    failedEnvelopes: result.failedEnvelopes,
    melExports: 0,
    stoppedEarly: result.stoppedEarly,
    stopReason: result.stopReason,
    validation,
    tests: {
      testsStatus,
      buildStatus,
      p191Exit: p191Tests.status,
      tscExit: tscAll.status,
      p191TscErrorCount: p191TscErrors.length,
    },
    attempts: result.attempts.map((a) => ({
      ...a,
      candidateId: `${a.candidateId.slice(0, 6)}…`,
      envelopeId: a.envelopeId ? `${a.envelopeId.slice(0, 8)}…` : null,
    })),
  };

  await writeFile(
    path.join(ART, "p191-paperwork-release-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    path.join(ART, "p191-envelope-validation.json"),
    `${JSON.stringify(
      {
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        envelopes: validation.envelopes.map((e) => ({
          ...e,
          candidateId: `${e.candidateId.slice(0, 6)}…`,
          envelopeId: e.envelopeId ? `${e.envelopeId.slice(0, 8)}…` : null,
        })),
        summary: {
          confirmedSentCount: validation.confirmedSentCount,
          duplicateEnvelopes: validation.duplicateEnvelopes,
          ownershipPreserved: validation.ownershipPreserved,
          ownershipDrift: validation.ownershipDrift,
          queueRemaining: validation.queueRemaining,
          lifecycleIntegrityOk: validation.lifecycleIntegrityOk,
        },
      },
      null,
      2,
    )}\n`,
  );

  const md = buildP191ReadinessReportMarkdown({
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    sourceCohortId: cohort.sourceCohortId,
    attempted: result.attempted,
    successful: result.successful,
    failed: result.failed,
    confirmedDropboxSignSends: result.confirmedDropboxSignSends,
    duplicateEnvelopes: result.duplicateEnvelopes,
    auditEvents: result.auditEvents,
    p186Observations: result.p186Observations,
    finalP184Mode: finalMode,
    automationStatus: result.automationStatus,
    queueRemaining: validation.queueRemaining,
    viewed: result.viewed,
    signed: result.signed,
    failedEnvelopes: result.failedEnvelopes,
    testsStatus: `${testsStatus}; ${buildStatus}`,
  });
  await writeFile(path.join(ART, "p191-readiness-report.md"), md);

  console.log(
    JSON.stringify(
      {
        attempted: result.attempted,
        successful: result.successful,
        failed: result.failed,
        confirmedDropboxSignSends: result.confirmedDropboxSignSends,
        duplicateEnvelopes: result.duplicateEnvelopes,
        auditEvents: result.auditEvents,
        p186Observations: result.p186Observations,
        finalP184Mode: finalMode,
        automationStatus: result.automationStatus,
        queueRemaining: validation.queueRemaining,
        viewed: result.viewed,
        signed: result.signed,
        failedEnvelopes: result.failedEnvelopes,
        testsStatus,
        buildStatus,
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        stopReason: result.stopReason,
      },
      null,
      2,
    ),
  );

  if (result.successful !== 25 || finalMode !== "dry_run") {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await forceP184DryRun();
  } catch {
    // ignore
  }
  process.exit(1);
});
