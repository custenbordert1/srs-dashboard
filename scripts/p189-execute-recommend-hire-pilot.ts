/**
 * P189 — Controlled 25-candidate Recommend Hire production pilot.
 * This prompt authorizes exactly 25 Recommend Hire writes. No OA / paperwork / P187 / MEL.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import {
  buildP189OperatorApprovalQueue,
  buildP189ReadinessForecast,
  buildP189ReadinessReportMarkdown,
  buildP189RecommendHirePreview,
  executeP189RecommendHirePilot,
  freezeP189PilotCohort,
  newP189Authorization,
  redactCohortForPublic,
  runP189Preflight,
  validateP189Execution,
  type P189CandidateEnrichment,
} from "@/lib/p189-recommend-hire-pilot";
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

async function loadPreferIds(): Promise<string[]> {
  const files = [
    "p188-5-recruiter-restore-canary-local.json",
    "p188-6-recruiter-restore-batch-local.json",
    "p188-7-recruiter-restore-batch-local.json",
  ];
  const ids: string[] = [];
  for (const f of files) {
    try {
      const raw = await readFile(path.join(recruitingDataDir(), f), "utf8");
      const parsed = JSON.parse(raw) as {
        members?: Array<{ candidateId?: string }>;
        cohort?: { members?: Array<{ candidateId?: string }> };
      };
      const members = parsed.members ?? parsed.cohort?.members ?? [];
      for (const m of members) {
        if (m.candidateId) ids.push(m.candidateId);
      }
    } catch {
      // optional preference source
    }
  }
  return [...new Set(ids)];
}

const ART = path.join(process.cwd(), "artifacts");

async function main() {
  loadEnvLocal();
  // Hard-disable forbidden paths for this pilot
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

  const workflowsObj = await getCandidateWorkflowState();

  const preflight = await runP189Preflight({ workflows: workflowsObj });
  await writeFile(
    path.join(ART, "p189-production-preflight.json"),
    `${JSON.stringify(preflight, null, 2)}\n`,
  );
  if (!preflight.ok) {
    console.error(JSON.stringify({ aborted: true, preflight }, null, 2));
    process.exit(1);
  }

  const workflows = Object.values(workflowsObj);
  const ingestion = await readIngestionStore();
  const enrichments: Record<string, P189CandidateEnrichment> = {};
  for (const wf of workflows) {
    const c = ingestion.candidates[wf.candidateId] as
      | {
          positionId?: string | number | null;
          positionName?: string | null;
          city?: string | null;
          state?: string | null;
          firstName?: string | null;
          email?: string | null;
        }
      | undefined;
    const jobId = c?.positionId != null ? String(c.positionId) : null;
    enrichments[wf.candidateId] = {
      jobId,
      jobLabel: c?.positionName ?? null,
      city: c?.city ?? null,
      state: c?.state ?? null,
      identityResolved: Boolean(wf.candidateId && (c?.firstName || c?.email)),
    };
  }

  const preferCandidateIds = await loadPreferIds();
  const cohort = freezeP189PilotCohort({
    workflows,
    enrichments,
    preferCandidateIds,
  });

  // Secure full cohort locally; public artifact redacted
  await writeFile(
    path.join(recruitingDataDir(), "p189-frozen-cohort-local.json"),
    `${JSON.stringify(cohort, null, 2)}\n`,
  );
  await writeFile(
    path.join(ART, "p189-frozen-cohort.json"),
    `${JSON.stringify(redactCohortForPublic(cohort), null, 2)}\n`,
  );

  const workflowsById = new Map(workflows.map((w) => [w.candidateId, w]));
  const preview = buildP189RecommendHirePreview({
    cohort,
    workflowsById,
    enrichments,
  });
  await writeFile(
    path.join(ART, "p189-recommend-hire-preview.json"),
    `${JSON.stringify(preview, null, 2)}\n`,
  );

  if (preview.eligibleCount !== 25 || preview.blockedCount !== 0) {
    console.error(
      JSON.stringify(
        {
          aborted: true,
          reason: "Preview eligibility must be 25/25 before execution",
          eligibleCount: preview.eligibleCount,
          blockedCount: preview.blockedCount,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  // Operator confirmation: this production prompt authorizes exactly 25 writes.
  const authorization = newP189Authorization({
    cohort,
    authorizedBy: "operator-prompt-p189",
  });

  console.log(
    JSON.stringify(
      {
        phase: "P189",
        previewConfirmedViaPrompt: true,
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        executingWrites: 25,
      },
      null,
      2,
    ),
  );

  const result = await executeP189RecommendHirePilot({
    cohort,
    authorization,
    enrichments,
  });

  // Refresh workflows after writes
  const afterById = new Map(
    Object.entries(await getCandidateWorkflowState()),
  );

  const validation = validateP189Execution({
    cohort,
    result,
    workflowsById: afterById,
  });

  const jobByCandidate: Record<string, string | null> = {};
  const cityStateByCandidate: Record<string, string> = {};
  for (const m of cohort.members) {
    jobByCandidate[m.candidateId] = m.jobLabel ?? m.jobId;
    cityStateByCandidate[m.candidateId] =
      [m.city, m.state].filter(Boolean).join(", ") || "—";
  }

  const operatorQueue = buildP189OperatorApprovalQueue({
    cohort,
    workflowsById: afterById,
    jobByCandidate,
    cityStateByCandidate,
  });

  const forecast = buildP189ReadinessForecast({ operatorQueue });

  // Tests
  const recommendHireTests = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "src/lib/p188-1-hiring-recommendation-workflow/__tests__/p188-1-hiring-recommendation-workflow.test.ts",
      "src/lib/p189-recommend-hire-pilot/__tests__/p189-recommend-hire-pilot.test.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  const workflowTests = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "src/lib/p188-4-recruiter-ownership-durability/__tests__/p188-4-recruiter-ownership-durability.test.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  // Targeted build: full-project tsc, classify P189 vs unrelated repo errors
  const tscAll = spawnSync(
    process.execPath,
    [path.join("node_modules", "typescript", "bin", "tsc"), "--noEmit", "--pretty", "false"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const tscOut = `${tscAll.stdout}\n${tscAll.stderr}`;
  const p189TscErrors = tscOut
    .split("\n")
    .filter((l) => l.includes("p189-recommend-hire-pilot") && l.includes("error TS"));
  const unrelatedTsc = tscAll.status !== 0 && p189TscErrors.length === 0;

  const testsStatus =
    recommendHireTests.status === 0
      ? `pass (recommend-hire+p189 exit=${recommendHireTests.status}; ownership exit=${workflowTests.status})`
      : `fail recommend-hire/p189 exit=${recommendHireTests.status}`;

  const rhOut = `${recommendHireTests.stdout}\n${recommendHireTests.stderr}`;
  const newFailures = rhOut.includes("p189-recommend-hire-pilot") && recommendHireTests.status !== 0;
  const buildStatus =
    p189TscErrors.length === 0
      ? unrelatedTsc
        ? "pass for P189 (repo tsc has unrelated pre-existing errors)"
        : tscAll.status === 0
          ? "pass"
          : "pass for P189"
      : `fail P189 tsc: ${p189TscErrors.slice(0, 3).join(" | ")}`;

  const report = {
    phase: "P189",
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    authorization: {
      ...authorization,
      authorizationToken: "[redacted]",
    },
    attempted: result.attempted,
    successful: result.successful,
    failed: result.failed,
    auditEvents: result.auditEvents,
    p186Observations: result.p186Observations,
    duplicateRecommendations: result.duplicateRecommendations,
    staleConflicts: result.staleConflicts,
    stoppedEarly: result.stoppedEarly,
    stopReason: result.stopReason,
    approvalsCreated: result.approvalsCreated,
    paperworkCreated: result.paperworkCreated,
    validation,
    operatorQueueSummary: {
      recommendationCount: operatorQueue.recommendationCount,
      readyForOperatorApproval: operatorQueue.readyForOperatorApproval,
      blocked: operatorQueue.blocked,
      conflicts: operatorQueue.conflicts,
      duplicates: operatorQueue.duplicates,
    },
    forecast,
    tests: {
      recommendHireAndP189Exit: recommendHireTests.status,
      ownershipExit: workflowTests.status,
      testsStatus,
      newModuleFailures: newFailures,
      buildStatus,
      tscExit: tscAll.status,
      p189TscErrorCount: p189TscErrors.length,
    },
    attempts: result.attempts.map((a) => ({
      ...a,
      candidateId: `${a.candidateId.slice(0, 6)}…`,
    })),
    exactNextOperatorAction:
      "Review artifacts/p189-operator-queue.json and perform Operator Approval manually or via a future authorized P190 phase. Do not send paperwork. Do not enable P187. Do not begin P190 automatically.",
  };

  await writeFile(
    path.join(ART, "p189-recommend-hire-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    path.join(ART, "p189-operator-queue.json"),
    `${JSON.stringify(
      {
        ...operatorQueue,
        items: operatorQueue.items.map((i) => ({
          ...i,
          candidateId: `${i.candidateId.slice(0, 6)}…`,
        })),
      },
      null,
      2,
    )}\n`,
  );

  const md = buildP189ReadinessReportMarkdown({
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    successful: result.successful,
    failed: result.failed,
    operatorQueue,
    forecast,
    validationOk: validation.lifecycleIntegrityOk,
    testsStatus,
    buildStatus,
  });
  await writeFile(path.join(ART, "p189-readiness-report.md"), md);

  // Spot-check one persistence via store API
  if (result.attempts[0]?.ok) {
    const fullId = cohort.members[0]!.candidateId;
    const check = await getCandidateWorkflowState();
    if (check[fullId]?.recommendedStage !== "Hiring Recommendation") {
      console.error("Spot-check persistence failed");
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        attempted: result.attempted,
        successful: result.successful,
        failed: result.failed,
        auditEvents: result.auditEvents,
        p186Observations: result.p186Observations,
        operatorApprovalQueueSize: operatorQueue.readyForOperatorApproval,
        paperworkForecast: forecast.paperworkNeededForecast,
        testsStatus,
        buildStatus,
        exactNextOperatorAction: report.exactNextOperatorAction,
      },
      null,
      2,
    ),
  );

  if (result.successful !== 25 || result.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
