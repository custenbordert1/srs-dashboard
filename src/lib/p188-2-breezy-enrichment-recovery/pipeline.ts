import { createHash } from "node:crypto";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildCandidateContextFromWorkflow } from "@/lib/p188-1-hiring-recommendation-workflow/context";
import { detectOnboardingBypassFindings } from "@/lib/p188-1-hiring-recommendation-workflow/bypassDetector";
import { forecastP187EligibilityAfterRecommendations } from "@/lib/p188-1-hiring-recommendation-workflow/p187Forecast";
import { validateRecommendHire } from "@/lib/p188-1-hiring-recommendation-workflow/validator";
import type { P1881RecommendHireResult } from "@/lib/p188-1-hiring-recommendation-workflow/types";
import { resolveJobEnrichment } from "@/lib/p188-2-breezy-enrichment-recovery/jobEnrichment";
import { resolveRecruiterEnrichment } from "@/lib/p188-2-breezy-enrichment-recovery/recruiterEnrichment";
import type { P1882EnrichmentBundle } from "@/lib/p188-2-breezy-enrichment-recovery/sources";
import {
  P188_2_AUTH_EXPIRATION_HOURS,
  P188_2_PILOT_MAX,
  P188_2_SCHEMA_VERSION,
  P188_2_SOURCE_PHASE,
  type P1882EnrichmentPreviewUpdate,
  type P1882JobEnrichment,
  type P1882OperatorQueueId,
  type P1882OperatorQueueItem,
  type P1882PilotCandidate,
  type P1882RecruiterEnrichment,
  type P1882WriteAuthorizationPackage,
} from "@/lib/p188-2-breezy-enrichment-recovery/types";

function redactId(id: string): string {
  if (id.length <= 8) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function correlationId(candidateId: string, salt: string): string {
  return createHash("sha256")
    .update(`p188.2:${candidateId}:${salt}`)
    .digest("hex")
    .slice(0, 24);
}

export type P1882PipelineResult = {
  sourcePhase: typeof P188_2_SOURCE_PHASE;
  schemaVersion: typeof P188_2_SCHEMA_VERSION;
  scannedAt: string;
  recordsScanned: number;
  recruiter: {
    resolved: P1882RecruiterEnrichment[];
    ambiguous: P1882RecruiterEnrichment[];
    unresolved: P1882RecruiterEnrichment[];
    conflicting: P1882RecruiterEnrichment[];
    stale: P1882RecruiterEnrichment[];
    counts: {
      resolved: number;
      ambiguous: number;
      unresolved: number;
      conflicting: number;
      stale: number;
    };
  };
  job: {
    resolved: P1882JobEnrichment[];
    ambiguous: P1882JobEnrichment[];
    unresolved: P1882JobEnrichment[];
    conflicting: P1882JobEnrichment[];
    stale: P1882JobEnrichment[];
    counts: {
      resolved: number;
      ambiguous: number;
      unresolved: number;
      conflicting: number;
      stale: number;
    };
  };
  bothResolvedCount: number;
  oneResolvedCount: number;
  previewUpdates: P1882EnrichmentPreviewUpdate[];
  operatorQueues: Record<P1882OperatorQueueId, P1882OperatorQueueItem[]>;
  bypass: {
    findingsCount: number;
    candidateIds: string[];
    excludedFromP187: true;
    recommendationsCreated: 0;
    approvalsCreated: 0;
    paperworkSends: 0;
  };
  readiness: {
    recruiterResolvedCount: number;
    recruiterUnresolvedCount: number;
    jobResolvedCount: number;
    jobUnresolvedCount: number;
    bothResolvedCount: number;
    readyForRecruiterReview: number;
    readyForRecommendHire: number;
    stillBlocked: number;
    predictedP187EligibleAfterValidRecommendations: number;
  };
  pilotCandidates: P1882PilotCandidate[];
  writeAuthorizationPackage: P1882WriteAuthorizationPackage;
  sideEffects: {
    productionWrites: 0;
    approvals: 0;
    paperworkSends: 0;
    melWrites: 0;
    recommendationsExecuted: 0;
    p187Executed: 0;
  };
  finalRecommendation:
    | "ready_for_controlled_enrichment_write"
    | "operator_review_required"
    | "insufficient_authoritative_data";
};

const REVIEW_STATUSES = new Set(["Applied", "Recruiter Review", "Needs Review", "Qualified"]);
const PILOT_STATUSES = new Set(["Applied", "Recruiter Review"]);

export function runP1882EnrichmentPipeline(input: {
  bundle: P1882EnrichmentBundle;
  nowMs?: number;
  operatorAuthorizationPresent?: boolean;
}): P1882PipelineResult {
  const nowMs = input.nowMs ?? Date.now();
  const scannedAt = new Date(nowMs).toISOString();
  const workflows = input.bundle.workflows;

  const bypassFindings =
    input.bundle.bypassFindings.length > 0
      ? input.bundle.bypassFindings
      : detectOnboardingBypassFindings(workflows, { bypassFindingsDashboard: true });
  const bypassIds = new Set(bypassFindings.map((f) => f.candidateId));

  const recruiterAll: P1882RecruiterEnrichment[] = [];
  const jobAll: P1882JobEnrichment[] = [];

  for (const wf of workflows) {
    recruiterAll.push(resolveRecruiterEnrichment(wf, input.bundle, nowMs));
    jobAll.push(resolveJobEnrichment(wf, input.bundle, nowMs));
  }

  const recById = new Map(recruiterAll.map((r) => [r.candidateId, r]));
  const jobById = new Map(jobAll.map((j) => [j.candidateId, j]));

  const recruiterResolved = recruiterAll.filter((r) => r.resolved);
  const recruiterAmbiguous = recruiterAll.filter((r) => r.ambiguous && !r.resolved);
  const recruiterConflicting = recruiterAll.filter((r) => r.conflicting);
  const recruiterStale = recruiterAll.filter((r) => r.staleEvidence && !r.resolved);
  const recruiterUnresolved = recruiterAll.filter(
    (r) => !r.resolved && !r.ambiguous && !r.staleEvidence,
  );

  const jobResolved = jobAll.filter((j) => j.resolved);
  const jobAmbiguous = jobAll.filter((j) => j.ambiguous && !j.resolved);
  const jobConflicting = jobAll.filter((j) => j.conflicting);
  const jobStale = jobAll.filter((j) => j.staleEvidence && !j.resolved);
  const jobUnresolved = jobAll.filter(
    (j) => !j.resolved && !j.ambiguous && !j.staleEvidence,
  );

  let bothResolvedCount = 0;
  let oneResolvedCount = 0;
  const previewUpdates: P1882EnrichmentPreviewUpdate[] = [];

  for (const wf of workflows) {
    const r = recById.get(wf.candidateId)!;
    const j = jobById.get(wf.candidateId)!;
    const both = r.resolved && j.resolved;
    const one = (r.resolved || j.resolved) && !both;
    if (both) bothResolvedCount += 1;
    if (one) oneResolvedCount += 1;

    if (!r.resolved && !j.resolved) continue;
    previewUpdates.push({
      candidateId: wf.candidateId,
      recruiter: r.resolved ? r.recruiter : null,
      recruiterSource: r.resolved ? r.source : null,
      jobId: j.resolved ? j.jobId : null,
      jobSource: j.resolved ? j.source : null,
      mappingVersion: `p188.2.v${P188_2_SCHEMA_VERSION}`,
      auditCorrelationId: correlationId(wf.candidateId, scannedAt),
      updatedTimestamp: scannedAt,
      bypassExcluded: bypassIds.has(wf.candidateId),
    });
  }

  const operatorQueues = emptyQueues();

  for (const wf of workflows) {
    const r = recById.get(wf.candidateId)!;
    const j = jobById.get(wf.candidateId)!;
    const base = (
      queueId: P1882OperatorQueueId,
      proposed: string[],
      evidence: string | null,
      confidence: P1882RecruiterEnrichment["confidence"] | P1882JobEnrichment["confidence"],
      recommended: string,
    ): P1882OperatorQueueItem => ({
      queueId,
      candidateId: wf.candidateId,
      redactedCandidateId: redactId(wf.candidateId),
      currentWorkflowState: wf.workflowStatus ?? null,
      proposedMatches: proposed,
      evidence,
      confidence,
      recommendedOperatorSelection: recommended,
    });

    if (r.resolved) {
      operatorQueues.recruiter_confidently_resolved.push(
        base(
          "recruiter_confidently_resolved",
          [r.recruiter!],
          r.evidenceReference,
          r.confidence,
          `Confirm recruiter ${r.recruiter}`,
        ),
      );
    } else if (r.ambiguous) {
      operatorQueues.recruiter_ambiguous.push(
        base(
          "recruiter_ambiguous",
          r.alternateCandidates,
          r.evidenceReference,
          r.confidence,
          r.operatorActionRequired ?? "Select recruiter",
        ),
      );
    } else {
      operatorQueues.recruiter_unresolved.push(
        base(
          "recruiter_unresolved",
          [],
          r.evidenceReference,
          r.confidence,
          r.operatorActionRequired ?? "Provide recruiter mapping",
        ),
      );
    }

    if (j.resolved) {
      operatorQueues.job_confidently_resolved.push(
        base(
          "job_confidently_resolved",
          [j.jobId!],
          j.evidenceReference,
          j.confidence,
          `Confirm job ${j.jobId}`,
        ),
      );
    } else if (j.ambiguous) {
      operatorQueues.job_ambiguous.push(
        base(
          "job_ambiguous",
          j.alternateMatches,
          j.evidenceReference,
          j.confidence,
          j.operatorActionRequired ?? "Select job",
        ),
      );
    } else {
      operatorQueues.job_unresolved.push(
        base(
          "job_unresolved",
          [],
          j.evidenceReference,
          j.confidence,
          j.operatorActionRequired ?? "Provide job mapping",
        ),
      );
    }

    if (r.resolved && j.resolved) {
      operatorQueues.both_resolved.push(
        base(
          "both_resolved",
          [`recruiter:${r.recruiter}`, `job:${j.jobId}`],
          `${r.evidenceReference}|${j.evidenceReference}`,
          "high",
          "Authorize enrichment write when package approved",
        ),
      );
    } else if (r.resolved || j.resolved) {
      operatorQueues.one_resolved.push(
        base(
          "one_resolved",
          [
            ...(r.resolved ? [`recruiter:${r.recruiter}`] : []),
            ...(j.resolved ? [`job:${j.jobId}`] : []),
          ],
          r.evidenceReference ?? j.evidenceReference,
          "medium",
          "Resolve remaining side before write",
        ),
      );
    }

    if (r.conflicting || j.conflicting) {
      operatorQueues.conflicting_evidence.push(
        base(
          "conflicting_evidence",
          [...r.alternateCandidates, ...j.alternateMatches],
          `${r.evidenceReference ?? ""}|${j.evidenceReference ?? ""}`,
          "none",
          "Resolve conflicting evidence manually",
        ),
      );
    }
    if (r.staleEvidence || j.staleEvidence) {
      operatorQueues.stale_evidence.push(
        base(
          "stale_evidence",
          [...r.alternateCandidates, ...j.alternateMatches],
          r.evidenceReference ?? j.evidenceReference,
          "none",
          "Refresh evidence or confirm mapping",
        ),
      );
    }
  }

  // --- Readiness re-eval with enrichment applied in context only (no writes) ---
  let readyForRecommendHire = 0;
  let readyForRecruiterReview = 0;
  let stillBlocked = 0;
  const simulatedSuccess: P1881RecommendHireResult[] = [];
  const jobByCandidate: Record<string, string> = {};
  const pilotCandidates: P1882PilotCandidate[] = [];

  for (const wf of workflows) {
    const r = recById.get(wf.candidateId)!;
    const j = jobById.get(wf.candidateId)!;
    const excluded = bypassIds.has(wf.candidateId);

    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      recruiterId: r.resolved ? r.recruiter : wf.assignedRecruiter,
      recruiterResolved: r.resolved,
      jobId: j.resolved ? j.jobId : null,
      jobLabel: j.resolved ? j.jobTitle : null,
      jobResolved: j.resolved,
      identityResolved: true,
      reviewCompleted:
        wf.workflowStatus === "Needs Review" ||
        wf.workflowStatus === "Qualified" ||
        wf.workflowStatus === "Recruiter Review" ||
        Boolean(wf.lastActionAt),
      nowMs,
      // Treat bypass historical records as blocked for recommend path
      conflictingOperation: excluded,
    });

    // Bypass: force not recommend-ready
    if (excluded) {
      stillBlocked += 1;
      continue;
    }

    const validation = validateRecommendHire({
      actor: "p188.2-validation",
      role: "recruiter",
      reason: "P188.2 enrichment readiness re-evaluation (preview only)",
      context: {
        ...ctx,
        // Fresh version gate: use matching expected version in preview
        expectedProductionRecordVersion: ctx.productionRecordVersion,
        stale: false,
      },
    });

    if (validation.eligible) {
      readyForRecommendHire += 1;
      if (j.jobId) jobByCandidate[wf.candidateId] = j.jobId;
      simulatedSuccess.push({
        ok: true,
        status: "preview",
        candidateId: wf.candidateId,
        correlationId: correlationId(wf.candidateId, "forecast"),
        idempotencyKey: `p188.2-forecast:${wf.candidateId}`,
        recommendedStage: "Hiring Recommendation",
        previousWorkflowStatus: wf.workflowStatus,
        resultingWorkflowStatus: wf.workflowStatus,
        auditId: null,
        p186Observed: false,
        detail: "Simulated successful recommendation for P187 forecast only",
        blockers: [],
        paperworkSendsAttempted: 0,
        approvalsAttempted: 0,
        melWritesAttempted: 0,
      });

      if (
        pilotCandidates.length < P188_2_PILOT_MAX &&
        PILOT_STATUSES.has(wf.workflowStatus) &&
        r.resolved &&
        j.resolved
      ) {
        pilotCandidates.push({
          candidateId: wf.candidateId,
          redactedCandidateId: redactId(wf.candidateId),
          workflowStatus: wf.workflowStatus,
          recruiter: r.recruiter!,
          jobId: j.jobId!,
          jobTitle: j.jobTitle,
          bypassExcluded: false,
        });
      }
    } else if (REVIEW_STATUSES.has(wf.workflowStatus ?? "")) {
      if (r.resolved && j.resolved && PILOT_STATUSES.has(wf.workflowStatus)) {
        readyForRecruiterReview += 1;
      }
      stillBlocked += 1;
    } else if (
      ["Applied", "Needs Review", "Qualified", "Recruiter Review"].includes(
        wf.workflowStatus ?? "",
      )
    ) {
      stillBlocked += 1;
    }
  }

  // Also count Applied/Recruiter Review with both resolved but not yet recommend-eligible as recruiter review ready
  // (already counted above when not eligible)

  const forecast = forecastP187EligibilityAfterRecommendations({
    workflows: applyVirtualEnrichment(workflows, recById, jobById),
    successfulRecommendations: simulatedSuccess,
    jobByCandidate,
  });

  // Exclude bypass from forecast eligibility
  const predictedEligibleIds = forecast.predictedEligibleIds.filter(
    (id) => !bypassIds.has(id),
  );

  const expiresAt = new Date(
    nowMs + P188_2_AUTH_EXPIRATION_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const writeCandidates = previewUpdates.filter(
    (u) =>
      u.recruiter &&
      u.jobId &&
      !u.bypassExcluded &&
      !recruiterAmbiguous.some((a) => a.candidateId === u.candidateId) &&
      !jobAmbiguous.some((a) => a.candidateId === u.candidateId),
  );

  const writeAuthorizationPackage: P1882WriteAuthorizationPackage = {
    generatedAt: scannedAt,
    expiresAt,
    candidateIds: writeCandidates.map((u) => u.candidateId),
    mappings: writeCandidates,
    operatorConfirmationRequired: true,
    executed: false,
    productionWrites: 0,
    rollbackGuidance:
      "Restore previous assignedRecruiter/job fields from pre-write workflow snapshot; " +
      "use auditCorrelationId as idempotency revoke key; do not cascade into Recommend Hire or P187.",
  };

  // Safety: never write even if operatorAuthorizationPresent in this phase module
  void input.operatorAuthorizationPresent;

  let finalRecommendation: P1882PipelineResult["finalRecommendation"];
  if (bothResolvedCount === 0 && jobResolved.length === 0 && recruiterResolved.length === 0) {
    finalRecommendation = "insufficient_authoritative_data";
  } else if (
    recruiterAmbiguous.length > 0 ||
    jobAmbiguous.length > 0 ||
    recruiterUnresolved.length > bothResolvedCount ||
    writeCandidates.length === 0
  ) {
    // Jobs may resolve while recruiters don't — need operator review for recruiter side
    if (jobResolved.length > 0 && recruiterResolved.length === 0) {
      finalRecommendation = "insufficient_authoritative_data";
    } else if (bothResolvedCount > 0 && writeCandidates.length > 0) {
      finalRecommendation =
        recruiterAmbiguous.length + jobAmbiguous.length > 0
          ? "operator_review_required"
          : "ready_for_controlled_enrichment_write";
    } else {
      finalRecommendation = "operator_review_required";
    }
  } else if (bothResolvedCount > 0) {
    finalRecommendation = "ready_for_controlled_enrichment_write";
  } else {
    finalRecommendation = "operator_review_required";
  }

  return {
    sourcePhase: P188_2_SOURCE_PHASE,
    schemaVersion: P188_2_SCHEMA_VERSION,
    scannedAt,
    recordsScanned: workflows.length,
    recruiter: {
      resolved: recruiterResolved,
      ambiguous: recruiterAmbiguous,
      unresolved: recruiterUnresolved,
      conflicting: recruiterConflicting,
      stale: recruiterStale,
      counts: {
        resolved: recruiterResolved.length,
        ambiguous: recruiterAmbiguous.length,
        unresolved: recruiterUnresolved.length,
        conflicting: recruiterConflicting.length,
        stale: recruiterStale.length,
      },
    },
    job: {
      resolved: jobResolved,
      ambiguous: jobAmbiguous,
      unresolved: jobUnresolved,
      conflicting: jobConflicting,
      stale: jobStale,
      counts: {
        resolved: jobResolved.length,
        ambiguous: jobAmbiguous.length,
        unresolved: jobUnresolved.length,
        conflicting: jobConflicting.length,
        stale: jobStale.length,
      },
    },
    bothResolvedCount,
    oneResolvedCount,
    previewUpdates,
    operatorQueues,
    bypass: {
      findingsCount: bypassFindings.length,
      candidateIds: [...bypassIds],
      excludedFromP187: true,
      recommendationsCreated: 0,
      approvalsCreated: 0,
      paperworkSends: 0,
    },
    readiness: {
      recruiterResolvedCount: recruiterResolved.length,
      recruiterUnresolvedCount: workflows.length - recruiterResolved.length,
      jobResolvedCount: jobResolved.length,
      jobUnresolvedCount: workflows.length - jobResolved.length,
      bothResolvedCount,
      readyForRecruiterReview,
      readyForRecommendHire,
      stillBlocked,
      predictedP187EligibleAfterValidRecommendations: predictedEligibleIds.length,
    },
    pilotCandidates,
    writeAuthorizationPackage,
    sideEffects: {
      productionWrites: 0,
      approvals: 0,
      paperworkSends: 0,
      melWrites: 0,
      recommendationsExecuted: 0,
      p187Executed: 0,
    },
    finalRecommendation,
  };
}

function emptyQueues(): Record<P1882OperatorQueueId, P1882OperatorQueueItem[]> {
  return {
    recruiter_confidently_resolved: [],
    recruiter_ambiguous: [],
    recruiter_unresolved: [],
    job_confidently_resolved: [],
    job_ambiguous: [],
    job_unresolved: [],
    both_resolved: [],
    one_resolved: [],
    conflicting_evidence: [],
    stale_evidence: [],
  };
}

function applyVirtualEnrichment(
  workflows: CandidateWorkflowRecord[],
  recById: Map<string, P1882RecruiterEnrichment>,
  jobById: Map<string, P1882JobEnrichment>,
): CandidateWorkflowRecord[] {
  return workflows.map((wf) => {
    const r = recById.get(wf.candidateId);
    if (!r?.resolved || !r.recruiter) return wf;
    return { ...wf, assignedRecruiter: r.recruiter };
  });
}

/**
 * Production enrichment writes are refused unless explicit auth — and even then
 * this phase module never performs them. Preview-only default.
 */
export function refuseProductionEnrichmentWrite(input: {
  operatorAuthorizationToken?: string | null;
  enrichmentWriteExecutionFlag: boolean;
  allowProductionWrites: boolean;
}): {
  allowed: false;
  productionWrites: 0;
  detail: string;
} {
  if (!input.enrichmentWriteExecutionFlag) {
    return {
      allowed: false,
      productionWrites: 0,
      detail: "P188_ENRICHMENT_WRITE_EXECUTION flag is off — preview only",
    };
  }
  if (!input.allowProductionWrites) {
    return {
      allowed: false,
      productionWrites: 0,
      detail: "allowProductionWrites is false — preview only",
    };
  }
  if (!input.operatorAuthorizationToken?.trim()) {
    return {
      allowed: false,
      productionWrites: 0,
      detail: "Operator authorization token required",
    };
  }
  // P188.2 deliberately never writes even if all gates pass — authorize package only.
  return {
    allowed: false,
    productionWrites: 0,
    detail:
      "P188.2 module refuses production writes by design; execute in a future authorized write phase",
  };
}
