/**
 * P188.5 — Execute 10-candidate recruiter ownership restore canary.
 * Authorized by explicit operator prompt for this cohort only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadP158AssignmentAuditLog } from "@/lib/p158-autonomous-recruiter-assignment";
import {
  buildCandidateContextFromWorkflow,
  detectOnboardingBypassFindings,
  forecastP187EligibilityAfterRecommendations,
  validateRecommendHire,
  type P1881RecommendHireResult,
} from "@/lib/p188-1-hiring-recommendation-workflow";
import {
  buildEnrichmentBundle,
  resolveJobEnrichment,
} from "@/lib/p188-2-breezy-enrichment-recovery";
import { buildRestorePreview } from "@/lib/p188-4-recruiter-ownership-durability/restorePreview";
import {
  buildRollbackPlanMarkdown,
  executeP1885CanaryRestore,
  freezeP1885CanaryCohort,
  newAuthorization,
  redactCohortForPublic,
  runIngestionDurabilityChallenge,
  runP1885Preflight,
  P188_5_SOURCE_PHASE,
} from "@/lib/p188-5-recruiter-restore-canary";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import { createHash } from "node:crypto";

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

async function main() {
  loadEnvLocal();
  // Ensure restore feature flag is off for preflight observation, then auth enables execution path directly.
  delete process.env.P188_OWNERSHIP_RESTORE_EXECUTION;
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;

  await mkdir(ART, { recursive: true });
  await safeRecruitingMkdir(recruitingDataDir());

  // 1) Run P188.4 tests as abort gate
  const testRun = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "src/lib/p188-4-recruiter-ownership-durability/__tests__/p188-4-recruiter-ownership-durability.test.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const p1884TestsPassed = testRun.status === 0;

  const preflight = await runP1885Preflight({ p1884TestsAlreadyPassed: p1884TestsPassed });
  await writeFile(
    path.join(ART, "p188-5-restore-canary-preflight.json"),
    `${JSON.stringify({ ...preflight, p1884TestExitCode: testRun.status }, null, 2)}\n`,
  );

  if (!preflight.ok) {
    console.error(JSON.stringify({ aborted: true, preflight }, null, 2));
    process.exit(1);
  }

  const [workflowsMap, ingestion, p158] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
  ]);
  const workflows = Object.values(workflowsMap);
  const breezyCandidates = Object.values(ingestion.candidates ?? {});

  const cohort = await freezeP1885CanaryCohort({
    workflows,
    breezyCandidates,
    p158Events: p158,
    size: 10,
  });
  const auth = newAuthorization(cohort, "operator:p188.5-prompt");

  await writeFile(
    path.join(ART, "p188-5-frozen-cohort.json"),
    `${JSON.stringify(redactCohortForPublic(cohort), null, 2)}\n`,
  );

  // Secured local file with full IDs (gitignored)
  await writeFile(
    path.join(recruitingDataDir(), "p188-5-recruiter-restore-canary-local.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "LOCAL OPERATOR ONLY — do not commit",
        authorization: {
          ...auth,
          // keep token local only
        },
        cohort,
      },
      null,
      2,
    )}\n`,
  );

  // 4) Execute sequential restores (this prompt authorizes the 10 writes)
  const execution = await executeP1885CanaryRestore({
    cohort,
    authorization: auth,
  });

  await writeFile(
    path.join(ART, "p188-5-production-restore-report.json"),
    `${JSON.stringify(
      {
        sourcePhase: P188_5_SOURCE_PHASE,
        authorization: {
          actor: auth.actor,
          authorizedAt: auth.authorizedAt,
          cohortId: auth.cohortId,
          fingerprint: auth.fingerprint,
          maxRecruiterWrites: auth.maxRecruiterWrites,
          maxLedgerEvents: auth.maxLedgerEvents,
          expiresAt: auth.expiresAt,
          scope: auth.scope,
        },
        execution: {
          ...execution,
          attempts: execution.attempts.map((a) => ({
            ...a,
            candidateId: `${a.candidateId.slice(0, 4)}…${a.candidateId.slice(-4)}`,
          })),
        },
      },
      null,
      2,
    )}\n`,
  );

  if (execution.restored !== 10 || execution.failed > 0) {
    await writeFile(
      path.join(ART, "p188-5-rollback-plan.md"),
      buildRollbackPlanMarkdown({ cohort, execution }),
    );
    console.error(
      JSON.stringify(
        {
          abortedAfterPartial: true,
          execution: {
            restored: execution.restored,
            failed: execution.failed,
            stopReason: execution.stopReason,
          },
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  // 6) Ingestion durability challenge
  const ingestionReport = await runIngestionDurabilityChallenge(cohort);
  await writeFile(
    path.join(ART, "p188-5-ingestion-durability-report.json"),
    `${JSON.stringify(
      {
        sourcePhase: P188_5_SOURCE_PHASE,
        ...ingestionReport,
        details: ingestionReport.details.map((d) => ({
          ...d,
          candidateId: `${d.candidateId.slice(0, 4)}…${d.candidateId.slice(-4)}`,
        })),
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    path.join(ART, "p188-5-rollback-plan.md"),
    buildRollbackPlanMarkdown({ cohort, execution }),
  );

  // 9) Post-canary readiness
  const afterWorkflows = Object.values(await getCandidateWorkflowState());
  const namedNow = afterWorkflows.filter(
    (w) => w.assignedRecruiter && w.assignedRecruiter !== "Unassigned",
  ).length;
  const bypass = detectOnboardingBypassFindings(afterWorkflows, {
    bypassFindingsDashboard: true,
  });
  const bypassIds = new Set(bypass.map((b) => b.candidateId));
  const jobBundle = buildEnrichmentBundle({
    workflows: afterWorkflows,
    breezyCandidates,
  });

  let bothResolved = 0;
  let recommendationReady = 0;
  const simulated: P1881RecommendHireResult[] = [];
  const jobByCandidate: Record<string, string> = {};

  for (const wf of afterWorkflows) {
    const recruiterOk =
      Boolean(wf.assignedRecruiter?.trim()) && wf.assignedRecruiter !== "Unassigned";
    const job = resolveJobEnrichment(wf, jobBundle);
    if (recruiterOk && job.resolved) bothResolved += 1;
    if (!recruiterOk || !job.resolved || bypassIds.has(wf.candidateId)) continue;

    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      recruiterId: wf.assignedRecruiter,
      recruiterResolved: true,
      jobId: job.jobId,
      jobLabel: job.jobTitle,
      jobResolved: true,
      identityResolved: true,
      reviewCompleted: true,
      nowMs: Date.now(),
    });
    const v = validateRecommendHire({
      actor: "p188.5-post-canary",
      role: "recruiter",
      reason: "Post-canary readiness forecast only",
      context: {
        ...ctx,
        expectedProductionRecordVersion: ctx.productionRecordVersion,
        stale: false,
      },
    });
    if (!v.eligible) continue;
    recommendationReady += 1;
    if (job.jobId) jobByCandidate[wf.candidateId] = job.jobId;
    simulated.push({
      ok: true,
      status: "preview",
      candidateId: wf.candidateId,
      correlationId: createHash("sha256").update(wf.candidateId).digest("hex").slice(0, 16),
      idempotencyKey: `p188.5-forecast:${wf.candidateId}`,
      recommendedStage: "Hiring Recommendation",
      previousWorkflowStatus: wf.workflowStatus,
      resultingWorkflowStatus: wf.workflowStatus,
      auditId: null,
      p186Observed: false,
      detail: "forecast",
      blockers: [],
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    });
  }

  const forecast = forecastP187EligibilityAfterRecommendations({
    workflows: afterWorkflows,
    successfulRecommendations: simulated,
    jobByCandidate,
  });

  const remainingPreview = await buildRestorePreview({
    workflows: afterWorkflows,
    breezyCandidates,
    p158Events: p158,
  });

  const remainingConfirmable = remainingPreview.totals.operatorConfirmable;
  const safeBatch50 =
    ingestionReport.clobbered === 0 &&
    execution.restored === 10 &&
    remainingConfirmable > 0;

  const readiness = {
    sourcePhase: P188_5_SOURCE_PHASE,
    restoredRecruiterCount: namedNow,
    bothResolvedCount: bothResolved,
    recommendationReady,
    predictedP187Eligible: forecast.predictedEligibleCount,
    remainingOperatorConfirmable: remainingConfirmable,
    remainingStillUnassignedConfirmable: afterWorkflows.filter((w) => {
      if (w.assignedRecruiter && w.assignedRecruiter !== "Unassigned") return false;
      return remainingPreview.bucketA.some((b) => b.candidateId === w.candidateId);
    }).length,
    remainingConflicts: remainingPreview.totals.conflicting,
    safeToRestoreBatchesOf50: safeBatch50,
    recommendedNextBatchSize: safeBatch50 ? Math.min(50, remainingConfirmable) : 0,
    sideEffects: {
      lifecycleWrites: 0,
      recommendations: 0,
      approvals: 0,
      paperworkSends: 0,
      melWrites: 0,
    },
  };

  await writeFile(
    path.join(ART, "p188-5-post-canary-readiness.json"),
    `${JSON.stringify(readiness, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        attempted: execution.attempted,
        restored: execution.restored,
        failed: execution.failed,
        ledgerEventsWritten: execution.ledgerEventsWritten,
        ingestion: {
          preserved: ingestionReport.preserved,
          clobbered: ingestionReport.clobbered,
        },
        readiness,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
