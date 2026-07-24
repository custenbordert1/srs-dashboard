/**
 * P188.6 — Execute controlled 50-candidate recruiter restore batch.
 * Authorized by explicit operator prompt for this batch only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  buildP1886RollbackPlanMarkdown,
  executeP1886BatchRestore,
  freezeP1886BatchCohort,
  loadPriorCanaryCohort,
  newP1886Authorization,
  redactCohortForPublic,
  runP1886IngestionDurabilityChallenge,
  runP1886Preflight,
  P188_6_SOURCE_PHASE,
} from "@/lib/p188-6-recruiter-restore-batch";
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

async function main() {
  loadEnvLocal();
  delete process.env.P188_OWNERSHIP_RESTORE_EXECUTION;
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;

  await mkdir(ART, { recursive: true });
  await safeRecruitingMkdir(recruitingDataDir());

  const testRun = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "src/lib/p188-4-recruiter-ownership-durability/__tests__/p188-4-recruiter-ownership-durability.test.ts",
      "src/lib/p188-5-recruiter-restore-canary/__tests__/p188-5-recruiter-restore-canary.test.ts",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const priorTestsPassed = testRun.status === 0;

  const preflight = await runP1886Preflight({ priorTestsPassed });
  await writeFile(
    path.join(ART, "p188-6-batch-preflight.json"),
    `${JSON.stringify({ ...preflight, priorTestExitCode: testRun.status }, null, 2)}\n`,
  );
  if (!preflight.ok) {
    console.error(JSON.stringify({ aborted: true, preflight }, null, 2));
    process.exit(1);
  }

  const priorCanary = await loadPriorCanaryCohort();
  if (!priorCanary) {
    console.error(JSON.stringify({ aborted: true, reason: "prior canary missing" }, null, 2));
    process.exit(1);
  }

  const [workflowsMap, ingestion, p158] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
  ]);
  const workflows = Object.values(workflowsMap);
  const breezyCandidates = Object.values(ingestion.candidates ?? {});

  const cohort = await freezeP1886BatchCohort({
    workflows,
    breezyCandidates,
    p158Events: p158,
    excludeCandidateIds: priorCanary.members.map((m) => m.candidateId),
    size: 50,
  });
  const auth = newP1886Authorization(cohort, "operator:p188.6-prompt");

  await writeFile(
    path.join(ART, "p188-6-frozen-cohort.json"),
    `${JSON.stringify(redactCohortForPublic(cohort), null, 2)}\n`,
  );
  await writeFile(
    path.join(recruitingDataDir(), "p188-6-recruiter-restore-batch-local.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "LOCAL OPERATOR ONLY — do not commit",
        authorization: auth,
        cohort,
        priorCanaryCohortId: priorCanary.cohortId,
      },
      null,
      2,
    )}\n`,
  );

  const execution = await executeP1886BatchRestore({
    cohort,
    authorization: auth,
  });

  await writeFile(
    path.join(ART, "p188-6-production-restore-report.json"),
    `${JSON.stringify(
      {
        sourcePhase: P188_6_SOURCE_PHASE,
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

  await writeFile(
    path.join(ART, "p188-6-rollback-plan.md"),
    buildP1886RollbackPlanMarkdown({ cohort, execution }),
  );

  if (execution.restored !== 50 || execution.failed > 0) {
    console.error(
      JSON.stringify(
        {
          abortedAfterPartial: true,
          restored: execution.restored,
          failed: execution.failed,
          stopReason: execution.stopReason,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const ingestionReport = await runP1886IngestionDurabilityChallenge({
    newBatch: cohort,
    priorCanary,
  });
  await writeFile(
    path.join(ART, "p188-6-ingestion-durability-report.json"),
    `${JSON.stringify(
      {
        sourcePhase: P188_6_SOURCE_PHASE,
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

  if (
    ingestionReport.newBatchPreserved !== 50 ||
    ingestionReport.priorCanaryPreserved !== 10 ||
    ingestionReport.clobbered !== 0
  ) {
    console.error(JSON.stringify({ ingestionFailed: true, ingestionReport }, null, 2));
    process.exit(1);
  }

  // Readiness forecast
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
      actor: "p188.6-forecast",
      role: "recruiter",
      reason: "Post-batch readiness forecast only",
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
      idempotencyKey: `p188.6-forecast:${wf.candidateId}`,
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
  const namedIds = new Set(
    afterWorkflows
      .filter((w) => w.assignedRecruiter && w.assignedRecruiter !== "Unassigned")
      .map((w) => w.candidateId),
  );
  const remainingConfirmable = remainingPreview.bucketA.filter(
    (b) => !namedIds.has(b.candidateId),
  ).length;
  const remainingConflicts = remainingPreview.totals.conflicting;
  const remainingImpossible = remainingPreview.totals.insufficientEvidence;

  const readiness = {
    sourcePhase: P188_6_SOURCE_PHASE,
    totalRestoredRecruiterAssignments: namedNow,
    bothResolvedCount: bothResolved,
    recommendationReady,
    predictedP187Eligible: forecast.predictedEligibleCount,
    remainingOperatorConfirmableUnassigned: remainingConfirmable,
    remainingConflicts,
    remainingImpossibleUnrecoverable: remainingImpossible,
    recommendedNextBatchSize: Math.min(50, remainingConfirmable),
    stopAfterThisBatch: true,
    sideEffects: {
      lifecycleWrites: 0,
      recommendations: 0,
      approvals: 0,
      paperworkSends: 0,
      melWrites: 0,
    },
  };

  await writeFile(
    path.join(ART, "p188-6-readiness-forecast.json"),
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
        subBatchesCompleted: execution.subBatchesCompleted,
        ingestion: {
          newBatchPreserved: ingestionReport.newBatchPreserved,
          priorCanaryPreserved: ingestionReport.priorCanaryPreserved,
          clobbered: ingestionReport.clobbered,
          totalProtected: ingestionReport.totalNamedProtectedActual,
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
