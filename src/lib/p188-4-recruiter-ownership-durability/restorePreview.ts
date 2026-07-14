import { createHash } from "node:crypto";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { detectOnboardingBypassFindings } from "@/lib/p188-1-hiring-recommendation-workflow/bypassDetector";
import {
  buildEnrichmentBundle,
  resolveJobEnrichment,
} from "@/lib/p188-2-breezy-enrichment-recovery";
import { scanHistoricalNamedAssignments } from "@/lib/p188-3-recruiter-ownership-recovery/historicalScan";
import { simulateRecruiterRecovery } from "@/lib/p188-3-recruiter-ownership-recovery/recoverySimulation";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type {
  P1884ConflictClass,
  P1884OperatorReviewRow,
  P1884RestorePreviewItem,
} from "@/lib/p188-4-recruiter-ownership-durability/types";

function redactId(id: string): string {
  if (id.length <= 8) return `${id.slice(0, 2)}…`;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export type P1884RestorePreviewResult = {
  scannedAt: string;
  recordsScanned: number;
  bucketA: P1884RestorePreviewItem[];
  bucketB: P1884RestorePreviewItem[];
  bucketC: P1884RestorePreviewItem[];
  totals: {
    operatorConfirmable: number;
    conflicting: number;
    insufficientEvidence: number;
  };
  operatorReviewRows: P1884OperatorReviewRow[];
};

export async function buildRestorePreview(input: {
  workflows: CandidateWorkflowRecord[];
  breezyCandidates: BreezyCandidate[];
  p158Events?: P158AssignmentAuditEvent[];
  nowMs?: number;
}): Promise<P1884RestorePreviewResult> {
  const nowMs = input.nowMs ?? Date.now();
  const scannedAt = new Date(nowMs).toISOString();
  const historical = await scanHistoricalNamedAssignments({
    candidateIds: input.workflows.map((w) => w.candidateId),
  });
  const simulation = simulateRecruiterRecovery({
    workflows: input.workflows,
    lastNamedByCandidate: historical.lastNamedByCandidate,
    p158Events: input.p158Events ?? [],
    jobResolvedByCandidate: {},
    nowMs,
  });

  const jobBundle = buildEnrichmentBundle({
    workflows: input.workflows,
    breezyCandidates: input.breezyCandidates,
    nowMs,
  });
  const bypass = detectOnboardingBypassFindings(input.workflows, {
    bypassFindingsDashboard: true,
  });
  const bypassIds = new Set(bypass.map((b) => b.candidateId));
  const breezyById = Object.fromEntries(input.breezyCandidates.map((c) => [c.candidateId, c]));

  const bucketA: P1884RestorePreviewItem[] = [];
  const bucketB: P1884RestorePreviewItem[] = [];
  const bucketC: P1884RestorePreviewItem[] = [];
  const operatorReviewRows: P1884OperatorReviewRow[] = [];

  for (const row of simulation.rows) {
    const wf = input.workflows.find((w) => w.candidateId === row.candidateId)!;
    const job = resolveJobEnrichment(wf, jobBundle, nowMs);
    const named = historical.lastNamedByCandidate[row.candidateId];
    const breezy = breezyById[row.candidateId];
    const classification: P1884ConflictClass =
      row.bucket === "conflicting"
        ? "conflicting_history"
        : row.bucket === "impossible_to_recover"
          ? "missing_evidence"
          : row.bucket === "stale"
            ? "stale_assignment"
            : row.bucket === "automatically_recoverable" ||
                row.bucket === "operator_confirmation_required"
              ? "confirmed_restore"
              : "unresolved";

    const item: P1884RestorePreviewItem = {
      candidateId: row.candidateId,
      redactedCandidateId: redactId(row.candidateId),
      currentRecruiter: wf.assignedRecruiter,
      proposedRecruiter: row.proposedRecruiter,
      lastNamedAt: named?.at ?? row.evidenceAt,
      sourceEvent: named?.action ?? row.evidenceSource,
      assignmentHistorySummary: named
        ? `Last named ${named.recruiter} via ${named.action} at ${named.at}`
        : row.detail,
      confidence:
        classification === "confirmed_restore"
          ? named?.action.includes("manual")
            ? "high"
            : "medium"
          : classification === "conflicting_history"
            ? "low"
            : "none",
      jobResolved: job.resolved,
      workflowState: wf.workflowStatus,
      bypass: bypassIds.has(row.candidateId),
      classification,
      recommendationReadinessImpact:
        classification === "confirmed_restore" && job.resolved && !bypassIds.has(row.candidateId)
          ? "May become recommendation-ready after ownership restore (still requires Recommend Hire)"
          : "No immediate recommendation-ready impact",
    };

    if (classification === "confirmed_restore") bucketA.push(item);
    else if (classification === "conflicting_history") bucketB.push(item);
    else bucketC.push(item);

    if (classification === "confirmed_restore" || classification === "conflicting_history") {
      operatorReviewRows.push({
        candidateId: row.candidateId,
        candidateName: breezy
          ? `${breezy.firstName} ${breezy.lastName}`.trim()
          : row.candidateId,
        currentRecruiter: wf.assignedRecruiter,
        proposedRecruiter: row.proposedRecruiter,
        job: job.jobTitle ?? job.jobId,
        state: breezy?.state ?? null,
        assignmentEvidence: item.assignmentHistorySummary,
        conflictStatus: classification,
        recommendedAction:
          classification === "conflicting_history"
            ? "Resolve conflicting evidence before restore"
            : "Confirm restore of proposed recruiter",
      });
    }
  }

  return {
    scannedAt,
    recordsScanned: input.workflows.length,
    bucketA,
    bucketB,
    bucketC,
    totals: {
      operatorConfirmable: bucketA.length,
      conflicting: bucketB.length,
      insufficientEvidence: bucketC.length,
    },
    operatorReviewRows,
  };
}

export function buildRestoreIdempotencyKey(candidateId: string, proposed: string): string {
  return createHash("sha256")
    .update(`p188.4-restore:${candidateId}:${proposed}`)
    .digest("hex")
    .slice(0, 32);
}
