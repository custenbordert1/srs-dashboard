/**
 * P190 — Controlled 25-candidate Operator Approval production pilot.
 * Advances ONLY frozen P189 cohort p189-pilot-8e35d667e5 (fp 11a81d2a561882378aefa019).
 * No Paperwork Needed / P184 / P187 / Dropbox / MEL / automation.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildP190ReadinessForecast,
  buildP190ReadinessReportMarkdown,
  executeP190OperatorApprovalPilot,
  freezeP190FromP189Cohort,
  newP190Authorization,
  redactCohortForPublic,
  runP190Preflight,
  validateP190Execution,
  P190_REQUIRED_SOURCE_COHORT_ID,
  P190_REQUIRED_SOURCE_FINGERPRINT,
  type P189SourceCohort,
} from "@/lib/p190-operator-approval-pilot";
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

async function loadP189SourceCohort(): Promise<P189SourceCohort> {
  const raw = await readFile(
    path.join(recruitingDataDir(), "p189-frozen-cohort-local.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as P189SourceCohort;
  return parsed;
}

async function main() {
  loadEnvLocal();
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P187_AUTHORITY_ENABLED;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
  delete process.env.CONTINUOUS_AUTOMATION_ENABLED;
  delete process.env.P185_SCHEDULER_ENABLED;
  delete process.env.P188_OWNERSHIP_RESTORE_EXECUTION;
  if (!process.env.P184_MODE) process.env.P184_MODE = "dry_run";
  delete process.env.P184_LIVE_SEND;

  await mkdir(ART, { recursive: true });
  await safeRecruitingMkdir(recruitingDataDir());

  const source = await loadP189SourceCohort();
  if (source.cohortId !== P190_REQUIRED_SOURCE_COHORT_ID) {
    console.error(
      JSON.stringify({
        aborted: true,
        reason: "Source cohort ID mismatch",
        got: source.cohortId,
        required: P190_REQUIRED_SOURCE_COHORT_ID,
      }),
    );
    process.exit(1);
  }
  if (source.fingerprint !== P190_REQUIRED_SOURCE_FINGERPRINT) {
    console.error(
      JSON.stringify({
        aborted: true,
        reason: "Source fingerprint mismatch",
        got: source.fingerprint,
        required: P190_REQUIRED_SOURCE_FINGERPRINT,
      }),
    );
    process.exit(1);
  }

  const preflight = await runP190Preflight({
    sourceCohortId: source.cohortId,
    sourceFingerprint: source.fingerprint,
    sourceMemberCount: source.members.length,
  });
  await writeFile(
    path.join(ART, "p190-production-preflight.json"),
    `${JSON.stringify(preflight, null, 2)}\n`,
  );
  if (!preflight.ok) {
    console.error(JSON.stringify({ aborted: true, preflight }, null, 2));
    process.exit(1);
  }

  const workflowsObj = await getCandidateWorkflowState();
  const workflowsById = new Map(Object.entries(workflowsObj));

  const cohort = freezeP190FromP189Cohort({
    source,
    workflowsById,
  });

  await writeFile(
    path.join(recruitingDataDir(), "p190-frozen-cohort-local.json"),
    `${JSON.stringify(cohort, null, 2)}\n`,
  );
  await writeFile(
    path.join(ART, "p190-frozen-cohort.json"),
    `${JSON.stringify(redactCohortForPublic(cohort), null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        phase: "P190",
        sourceCohortId: cohort.sourceCohortId,
        sourceFingerprint: cohort.sourceFingerprint,
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        executingApprovals: 25,
        previewConfirmedViaPrompt: true,
      },
      null,
      2,
    ),
  );

  const authorization = newP190Authorization({
    cohort,
    authorizedBy: "operator-prompt-p190",
  });

  const result = await executeP190OperatorApprovalPilot({
    cohort,
    authorization,
  });

  const afterById = new Map(Object.entries(await getCandidateWorkflowState()));
  const validation = validateP190Execution({
    cohort,
    result,
    workflowsById: afterById,
  });
  const forecast = buildP190ReadinessForecast({
    queueReadyForPaperworkNeeded: validation.queueReadyForPaperworkNeeded,
    p184Mode: preflight.p184Mode,
  });

  const p190Tests = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "src/lib/p190-operator-approval-pilot/__tests__/p190-operator-approval-pilot.test.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  const tscAll = spawnSync(
    process.execPath,
    [path.join("node_modules", "typescript", "bin", "tsc"), "--noEmit", "--pretty", "false"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const tscOut = `${tscAll.stdout}\n${tscAll.stderr}`;
  const p190TscErrors = tscOut
    .split("\n")
    .filter((l) => l.includes("p190-operator-approval-pilot") && l.includes("error TS"));

  const testsStatus =
    p190Tests.status === 0
      ? `pass (p190 exit=${p190Tests.status})`
      : `fail p190 exit=${p190Tests.status}`;
  const buildStatus =
    p190TscErrors.length === 0
      ? "pass for P190 (repo tsc may have unrelated pre-existing errors)"
      : `fail P190 tsc: ${p190TscErrors.slice(0, 3).join(" | ")}`;

  const report = {
    phase: "P190",
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    sourceCohortId: cohort.sourceCohortId,
    sourceFingerprint: cohort.sourceFingerprint,
    attempted: result.attempted,
    successful: result.successful,
    failed: result.failed,
    auditEvents: result.auditEvents,
    p186Observations: result.p186Observations,
    duplicateApprovals: result.duplicateApprovals,
    paperworkCreated: result.paperworkCreated,
    dropboxSignSends: result.dropboxSignSends,
    melExports: result.melExports,
    automationStatus: preflight.automationStatus,
    p184Mode: preflight.p184Mode,
    queueReadyForPaperworkNeeded: validation.queueReadyForPaperworkNeeded,
    stoppedEarly: result.stoppedEarly,
    stopReason: result.stopReason,
    validation,
    forecast,
    tests: {
      testsStatus,
      buildStatus,
      p190Exit: p190Tests.status,
      tscExit: tscAll.status,
      p190TscErrorCount: p190TscErrors.length,
    },
    attempts: result.attempts.map((a) => ({
      ...a,
      candidateId: `${a.candidateId.slice(0, 6)}…`,
    })),
    exactNextOperatorAction:
      "Wait for explicit operator authorization before creating Paperwork Needed. Do not call P184, enable P187, or begin P191 automatically.",
  };

  await writeFile(
    path.join(ART, "p190-operator-approval-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const md = buildP190ReadinessReportMarkdown({
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    sourceCohortId: cohort.sourceCohortId,
    attempted: result.attempted,
    successful: result.successful,
    failed: result.failed,
    auditEvents: result.auditEvents,
    p186Observations: result.p186Observations,
    duplicateApprovals: result.duplicateApprovals,
    paperworkCreated: result.paperworkCreated,
    dropboxSignSends: result.dropboxSignSends,
    melExports: result.melExports,
    automationStatus: preflight.automationStatus,
    p184Mode: preflight.p184Mode,
    queueReadyForPaperworkNeeded: validation.queueReadyForPaperworkNeeded,
    testsStatus: `${testsStatus}; ${buildStatus}`,
  });
  await writeFile(path.join(ART, "p190-readiness-report.md"), md);

  console.log(
    JSON.stringify(
      {
        attempted: result.attempted,
        successful: result.successful,
        failed: result.failed,
        auditEvents: result.auditEvents,
        p186Observations: result.p186Observations,
        duplicateApprovals: result.duplicateApprovals,
        paperworkCreated: result.paperworkCreated,
        dropboxSignSends: result.dropboxSignSends,
        melExports: result.melExports,
        automationStatus: preflight.automationStatus,
        p184Mode: preflight.p184Mode,
        queueReadyForPaperworkNeeded: validation.queueReadyForPaperworkNeeded,
        testsStatus,
        buildStatus,
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        exactNextOperatorAction: report.exactNextOperatorAction,
      },
      null,
      2,
    ),
  );

  if (result.successful !== 25 || result.failed > 0 || result.paperworkCreated !== 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
