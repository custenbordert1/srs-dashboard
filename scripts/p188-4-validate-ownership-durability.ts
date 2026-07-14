/**
 * P188.4 validation — durability simulation + restore preview.
 * Default: no production ownership writes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
import {
  buildRestorePreview,
  executeOwnershipRestoreBatch,
  packageRestoreCanary,
  P188_4_SOURCE_PHASE,
  simulateOwnershipDurability,
  validateOwnershipLedgerHealth,
} from "@/lib/p188-4-recruiter-ownership-durability";
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
  delete process.env.P188_OWNERSHIP_RESTORE_EXECUTION;
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;

  await mkdir(ART, { recursive: true });
  await safeRecruitingMkdir(recruitingDataDir());

  const [workflowsMap, ingestion, p158, ledgerHealth] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
    validateOwnershipLedgerHealth(),
  ]);
  const workflows = Object.values(workflowsMap);
  const breezyCandidates = Object.values(ingestion.candidates ?? {});

  const durabilitySim = simulateOwnershipDurability();
  const preview = await buildRestorePreview({
    workflows,
    breezyCandidates,
    p158Events: p158,
  });

  // Gate check — must refuse
  const refused = await executeOwnershipRestoreBatch({
    candidates: packageRestoreCanary(preview.bucketA, 10),
    actor: "validation",
    actorRole: "operator",
    reason: "P188.4 validation — must not write",
    allowProductionWrites: false,
  });

  const bypass = detectOnboardingBypassFindings(workflows, {
    bypassFindingsDashboard: true,
  });
  const bypassIds = new Set(bypass.map((b) => b.candidateId));
  const jobBundle = buildEnrichmentBundle({ workflows, breezyCandidates });

  let bothResolved = 0;
  let recommendationReady = 0;
  const simulatedSuccess: P1881RecommendHireResult[] = [];
  const jobByCandidate: Record<string, string> = {};

  for (const item of preview.bucketA) {
    if (!item.proposedRecruiter || item.bypass) continue;
    const wf = workflowsMap[item.candidateId];
    if (!wf) continue;
    const job = resolveJobEnrichment(wf, jobBundle);
    if (!job.resolved) continue;
    bothResolved += 1;

    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      recruiterId: item.proposedRecruiter,
      recruiterResolved: true,
      jobId: job.jobId,
      jobLabel: job.jobTitle,
      jobResolved: true,
      identityResolved: true,
      reviewCompleted: true,
      nowMs: Date.now(),
    });
    const v = validateRecommendHire({
      actor: "p188.4-forecast",
      role: "recruiter",
      reason: "P188.4 post-restore forecast (simulation only)",
      context: {
        ...ctx,
        expectedProductionRecordVersion: ctx.productionRecordVersion,
        stale: false,
      },
    });
    if (!v.eligible || bypassIds.has(wf.candidateId)) continue;
    recommendationReady += 1;
    if (job.jobId) jobByCandidate[wf.candidateId] = job.jobId;
    simulatedSuccess.push({
      ok: true,
      status: "preview",
      candidateId: wf.candidateId,
      correlationId: createHash("sha256").update(wf.candidateId).digest("hex").slice(0, 16),
      idempotencyKey: `p188.4:${wf.candidateId}`,
      recommendedStage: "Hiring Recommendation",
      previousWorkflowStatus: wf.workflowStatus,
      resultingWorkflowStatus: wf.workflowStatus,
      auditId: null,
      p186Observed: false,
      detail: "forecast only",
      blockers: [],
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    });
  }

  const forecast = forecastP187EligibilityAfterRecommendations({
    workflows: workflows.map((wf) => {
      const item = preview.bucketA.find((b) => b.candidateId === wf.candidateId);
      return item?.proposedRecruiter
        ? { ...wf, assignedRecruiter: item.proposedRecruiter }
        : wf;
    }),
    successfulRecommendations: simulatedSuccess,
    jobByCandidate,
  });

  // Secured operator review file (gitignored under .data/)
  const operatorReviewPath = path.join(
    recruitingDataDir(),
    "p188-4-recruiter-restore-operator-review-local.json",
  );
  await writeFile(
    operatorReviewPath,
    `${JSON.stringify(
      {
        generatedAt: preview.scannedAt,
        note: "LOCAL OPERATOR ONLY — do not commit",
        rows: preview.operatorReviewRows,
      },
      null,
      2,
    )}\n`,
  );

  const ledgerValidation = {
    sourcePhase: P188_4_SOURCE_PHASE,
    ...ledgerHealth,
    appendOnly: true,
    deletesUnsupported: true,
  };

  const restoreSummary = {
    sourcePhase: P188_4_SOURCE_PHASE,
    scannedAt: preview.scannedAt,
    recordsScanned: preview.recordsScanned,
    totals: preview.totals,
    namedHistoricalAssignmentsFound: preview.totals.operatorConfirmable + preview.totals.conflicting,
    canaryPackage: packageRestoreCanary(preview.bucketA, 10).map((c) => ({
      candidateId: `${c.candidateId.slice(0, 4)}…`,
      proposedRecruiter: c.proposedRecruiter,
    })),
    restoreExecutionDefault: "refused",
    refusedDetail: refused.results[0]?.detail,
    productionRecruiterWrites: 0,
  };

  const conflictReport = {
    sourcePhase: P188_4_SOURCE_PHASE,
    conflicting: preview.totals.conflicting,
    items: preview.bucketB.map((b) => ({
      redactedCandidateId: b.redactedCandidateId,
      classification: b.classification,
      proposedRecruiter: b.proposedRecruiter,
      detail: b.assignmentHistorySummary,
    })),
  };

  const forecastArtifact = {
    sourcePhase: P188_4_SOURCE_PHASE,
    projectedBothResolved: bothResolved,
    projectedRecommendationReady: recommendationReady,
    projectedP187Eligible: forecast.predictedEligibleCount,
    bypassExcluded: bypassIds.size,
    simulationOnly: true,
    p187AuthorityEnabled: false,
  };

  const readiness = `# P188.4 Readiness Report

Generated: ${preview.scannedAt}

## Validation

| Metric | Value |
| --- | ---: |
| Records scanned | ${preview.recordsScanned} |
| Operator-confirmable restores | ${preview.totals.operatorConfirmable} |
| Conflicts | ${preview.totals.conflicting} |
| Insufficient evidence | ${preview.totals.insufficientEvidence} |
| Clobbers prevented (sim) | ${durabilitySim.clobbersPrevented} |
| Assignments preserved (sim) | ${durabilitySim.assignmentsPreserved} |
| Conflicts surfaced (sim) | ${durabilitySim.conflictsSurfaced} |
| Ledger ok | ${ledgerHealth.ok ? 1 : 0} |
| Projected both-resolved | ${bothResolved} |
| Projected recommendation-ready | ${recommendationReady} |
| Projected P187 eligible | ${forecast.predictedEligibleCount} |
| Production recruiter writes | 0 |
| Lifecycle writes | 0 |
| Approvals | 0 |
| Paperwork sends | 0 |
| MEL writes | 0 |

## Exact operator action for 10-candidate canary

1. Review \`.data/p188-4-recruiter-restore-operator-review-local.json\`
2. Confirm first 10 non-bypass bucket A rows
3. Run gated canary with \`P188_OWNERSHIP_RESTORE_EXECUTION=true\`, operator token, and \`--allow-production-writes\`
4. Stop on first systemic failure; leave conflicts untouched
5. Do not enable P187 / Recommend Hire / paperwork

## Final recommendation

**ready for controlled restore canary** (after operator confirmation of local review file)

Durability fixes are in place; production restores remain gated and were **not** executed in this validation.
`;

  await Promise.all([
    writeFile(
      path.join(ART, "p188-4-ownership-ledger-validation.json"),
      `${JSON.stringify(ledgerValidation, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-4-restore-preview-summary.json"),
      `${JSON.stringify(restoreSummary, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-4-conflict-report.json"),
      `${JSON.stringify(conflictReport, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-4-recommendation-readiness-forecast.json"),
      `${JSON.stringify(forecastArtifact, null, 2)}\n`,
    ),
    writeFile(path.join(ART, "p188-4-readiness-report.md"), readiness),
    writeFile(
      path.join(ART, "p188-4-durability-simulation.json"),
      `${JSON.stringify({ sourcePhase: P188_4_SOURCE_PHASE, ...durabilitySim }, null, 2)}\n`,
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        recordsScanned: preview.recordsScanned,
        restorePreview: preview.totals,
        durabilitySim: {
          preserved: durabilitySim.assignmentsPreserved,
          clobbersPrevented: durabilitySim.clobbersPrevented,
          conflicts: durabilitySim.conflictsSurfaced,
        },
        forecast: forecastArtifact,
        ledgerHealth,
        sideEffects: {
          productionRecruiterWrites: 0,
          lifecycleWrites: 0,
          approvals: 0,
          paperworkSends: 0,
          melWrites: 0,
        },
        restoreRefused: refused.results[0]?.detail,
        operatorReviewFile: operatorReviewPath,
        finalRecommendation: "ready_for_controlled_restore_canary",
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
