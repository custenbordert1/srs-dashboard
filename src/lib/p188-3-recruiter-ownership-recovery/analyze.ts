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
import { scanHistoricalNamedAssignments } from "@/lib/p188-3-recruiter-ownership-recovery/historicalScan";
import {
  buildAuthoritativeOwnershipDesign,
  renderAuthoritativeOwnershipDesignMarkdown,
} from "@/lib/p188-3-recruiter-ownership-recovery/ownershipDesign";
import { simulateRecruiterRecovery } from "@/lib/p188-3-recruiter-ownership-recovery/recoverySimulation";
import {
  buildRootCauseFindings,
  buildStaticSourceInventory,
} from "@/lib/p188-3-recruiter-ownership-recovery/sourceInventory";
import {
  P188_3_SCHEMA_VERSION,
  P188_3_SOURCE_PHASE,
} from "@/lib/p188-3-recruiter-ownership-recovery/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

function correlationId(candidateId: string, salt: string): string {
  return createHash("sha256")
    .update(`p188.3:${candidateId}:${salt}`)
    .digest("hex")
    .slice(0, 24);
}

export type P1883AnalysisResult = {
  sourcePhase: typeof P188_3_SOURCE_PHASE;
  schemaVersion: typeof P188_3_SCHEMA_VERSION;
  scannedAt: string;
  recordsScanned: number;
  ownershipAnalysis: ReturnType<typeof buildStaticSourceInventory>;
  rootCauseFindings: ReturnType<typeof buildRootCauseFindings>;
  primaryRootCause: string;
  whyOwnershipDisappeared: string;
  historicalReconstruction: {
    performed: false;
    potentialReconstructableFromAudit: number;
    linesScanned: number;
    rapidWipeCount: number;
    recruiterHistogram: Record<string, number>;
    note: string;
  };
  recoverySimulation: {
    counts: ReturnType<typeof simulateRecruiterRecovery>["counts"];
    sampleRows: ReturnType<typeof simulateRecruiterRecovery>["rows"];
  };
  authoritativeOwnershipDesign: ReturnType<typeof buildAuthoritativeOwnershipDesign>;
  authoritativeOwnershipDesignMarkdown: string;
  p187Forecast: {
    recommendationReady: number;
    p187Eligible: number;
    operatorReviewRequired: number;
    bothResolvedUnderSimulation: number;
    bypassExcluded: number;
    simulationOnly: true;
    p187AuthorityEnabled: false;
  };
  sideEffects: {
    productionWrites: 0;
    workflowUpdates: 0;
    approvals: 0;
    paperworkSends: 0;
    melWrites: 0;
    automationEnabled: false;
  };
  exactNextProductionAction: string;
};

/**
 * Full P188.3 read-only analysis against local production mirrors.
 */
export async function runP1883OwnershipAnalysis(options?: {
  nowMs?: number;
}): Promise<P1883AnalysisResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const scannedAt = new Date(nowMs).toISOString();

  const [workflowState, ingestion, p158Events] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
  ]);

  const workflows = Object.values(workflowState);
  const breezyCandidates = Object.values(ingestion.candidates ?? {});

  let ingestionOwnerFieldsPresent = 0;
  for (const c of breezyCandidates) {
    const raw = c as unknown as Record<string, unknown>;
    if (raw.owner || raw.assignee || raw.assigned_to || raw.recruiter || raw.assignedTo) {
      ingestionOwnerFieldsPresent += 1;
    }
  }

  const unassigned = workflows.filter(
    (w) => !w.assignedRecruiter?.trim() || w.assignedRecruiter === "Unassigned",
  ).length;

  const p158ProductionAssigned = p158Events.filter(
    (e) => e.action === "assigned" && e.executionMode === "production",
  ).length;
  const p158Simulated = p158Events.filter(
    (e) => e.executionMode === "simulation" || e.action === "simulated",
  ).length;
  const p158LastAt =
    p158Events.map((e) => e.at).sort().at(-1) ?? null;

  let workflowStoreUpdatedAt: string | null = null;
  try {
    const st = await stat(path.join(recruitingDataDir(), "candidate-workflows.json"));
    workflowStoreUpdatedAt = st.mtime.toISOString();
  } catch {
    workflowStoreUpdatedAt = null;
  }

  const historical = await scanHistoricalNamedAssignments({
    candidateIds: workflows.map((w) => w.candidateId),
  });

  const jobBundle = buildEnrichmentBundle({
    workflows,
    breezyCandidates,
    assignmentAudits: p158Events,
    nowMs,
  });
  const jobResolvedByCandidate: Record<string, boolean> = {};
  for (const wf of workflows) {
    const job = resolveJobEnrichment(wf, jobBundle, nowMs);
    jobResolvedByCandidate[wf.candidateId] = job.resolved;
  }

  const simulation = simulateRecruiterRecovery({
    workflows,
    lastNamedByCandidate: historical.lastNamedByCandidate,
    p158Events,
    jobResolvedByCandidate,
    nowMs,
  });

  const sourceInventory = buildStaticSourceInventory({
    workflowsUnassigned: unassigned,
    workflowsTotal: workflows.length,
    ingestionOwnerFieldsPresent,
    ingestionTotal: breezyCandidates.length,
    p158ProductionAssigned,
    p158Simulated,
    p158LastAt,
    auditLastAutoAssignAt:
      Object.values(historical.lastNamedByCandidate)
        .map((r) => r.at)
        .sort()
        .at(-1) ?? null,
    auditUniqueNamedCandidates: historical.uniqueNamedCount,
    workflowStoreUpdatedAt,
  });

  const rootCauseFindings = buildRootCauseFindings({
    workflowsUnassigned: unassigned,
    workflowsTotal: workflows.length,
    ingestionOwnerFieldsPresent,
    p158ProductionAssigned,
    auditNamedThenWipedEvidence: historical.uniqueNamedCount > 0 && unassigned === workflows.length,
    auditUniqueNamedCandidates: historical.uniqueNamedCount,
    rapidWipeEvents: historical.rapidWipeCount,
  });

  const design = buildAuthoritativeOwnershipDesign();

  // --- Simulated readiness (ownership virtually applied; no writes) ---
  const bypass = detectOnboardingBypassFindings(workflows, {
    bypassFindingsDashboard: true,
  });
  const bypassIds = new Set(bypass.map((f) => f.candidateId));

  let recommendationReady = 0;
  let operatorReviewRequired = 0;
  let bothResolvedUnderSimulation = 0;
  const simulatedSuccess: P1881RecommendHireResult[] = [];
  const jobByCandidate: Record<string, string> = {};

  const simRecruiter = new Map(
    simulation.rows
      .filter((r) => r.proposedRecruiter && (r.bucket === "operator_confirmation_required" || r.bucket === "automatically_recoverable"))
      .map((r) => [r.candidateId, r.proposedRecruiter!]),
  );

  // For forecast, also include conflicting as operator review only
  operatorReviewRequired =
    simulation.counts.operator_confirmation_required +
    simulation.counts.conflicting +
    simulation.counts.stale;

  for (const wf of workflows) {
    const recruiter = simRecruiter.get(wf.candidateId);
    const jobOk = jobResolvedByCandidate[wf.candidateId];
    if (recruiter && jobOk) bothResolvedUnderSimulation += 1;

    if (bypassIds.has(wf.candidateId)) continue;
    if (!recruiter || !jobOk) continue;

    const job = resolveJobEnrichment(wf, jobBundle, nowMs);
    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      recruiterId: recruiter,
      recruiterResolved: true,
      jobId: job.jobId,
      jobLabel: job.jobTitle,
      jobResolved: true,
      identityResolved: true,
      reviewCompleted:
        wf.workflowStatus === "Needs Review" ||
        wf.workflowStatus === "Qualified" ||
        wf.workflowStatus === "Recruiter Review" ||
        Boolean(wf.lastActionAt),
      nowMs,
      expectedProductionRecordVersion: undefined,
    });

    const validation = validateRecommendHire({
      actor: "p188.3-simulation",
      role: "recruiter",
      reason: "P188.3 ownership recovery simulation (no execution)",
      context: {
        ...ctx,
        expectedProductionRecordVersion: ctx.productionRecordVersion,
        stale: false,
      },
    });

    if (!validation.eligible) continue;
    recommendationReady += 1;
    if (job.jobId) jobByCandidate[wf.candidateId] = job.jobId;
    simulatedSuccess.push({
      ok: true,
      status: "preview",
      candidateId: wf.candidateId,
      correlationId: correlationId(wf.candidateId, "forecast"),
      idempotencyKey: `p188.3-forecast:${wf.candidateId}`,
      recommendedStage: "Hiring Recommendation",
      previousWorkflowStatus: wf.workflowStatus,
      resultingWorkflowStatus: wf.workflowStatus,
      auditId: null,
      p186Observed: false,
      detail: "Simulated recommendation after ownership recovery (not executed)",
      blockers: [],
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    });
  }

  const forecast = forecastP187EligibilityAfterRecommendations({
    workflows: workflows.map((wf) => {
      const recruiter = simRecruiter.get(wf.candidateId);
      return recruiter ? { ...wf, assignedRecruiter: recruiter } : wf;
    }),
    successfulRecommendations: simulatedSuccess.filter((r) => !bypassIds.has(r.candidateId)),
    jobByCandidate,
  });

  return {
    sourcePhase: P188_3_SOURCE_PHASE,
    schemaVersion: P188_3_SCHEMA_VERSION,
    scannedAt,
    recordsScanned: workflows.length,
    ownershipAnalysis: sourceInventory,
    rootCauseFindings,
    primaryRootCause:
      "Breezy ownership never imported (schema drop) + durable Unassigned create path + " +
      "lost-update/overwrite of historical auto-assignments (ingestion race / unlocked store) + " +
      "P158 production assignment disabled.",
    whyOwnershipDisappeared:
      "Named recruiters were assigned by automation (audit), then wiped when concurrent " +
      "ingestion_import / full-file upserts recreated or clobbered workflow rows as Unassigned. " +
      "Breezy owner was never available as a backfill source because sanitize discards it.",
    historicalReconstruction: {
      performed: false,
      potentialReconstructableFromAudit: historical.uniqueNamedCount,
      linesScanned: historical.linesScanned,
      rapidWipeCount: historical.rapidWipeCount,
      recruiterHistogram: historical.recruiterHistogram,
      note:
        "Reconstruction not performed. Counts reflect last named auto_assign/manual evidence in audit for current cohort only.",
    },
    recoverySimulation: {
      counts: simulation.counts,
      sampleRows: simulation.rows.slice(0, 100),
    },
    authoritativeOwnershipDesign: design,
    authoritativeOwnershipDesignMarkdown: renderAuthoritativeOwnershipDesignMarkdown(design),
    p187Forecast: {
      recommendationReady,
      p187Eligible: forecast.predictedEligibleCount,
      operatorReviewRequired,
      bothResolvedUnderSimulation,
      bypassExcluded: bypassIds.size,
      simulationOnly: true,
      p187AuthorityEnabled: false,
    },
    sideEffects: {
      productionWrites: 0,
      workflowUpdates: 0,
      approvals: 0,
      paperworkSends: 0,
      melWrites: 0,
      automationEnabled: false,
    },
    exactNextProductionAction:
      "Authorize a controlled ownership durability fix (store locking + stop Unassigned clobber on ingestion_import), " +
      "then an operator-confirmed restore of last named audit recruiters for the confirmation-required cohort — " +
      "without enabling P187 or paperwork. Do not start P188.4 until that restore plan is approved.",
  };
}
