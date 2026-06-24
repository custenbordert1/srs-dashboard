import { isAppliedDateInRange } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  ingestionPositionCoveragePct,
  listIngestedCandidates,
} from "@/lib/candidate-ingestion/ingestion-store";
import type { ApplicantCaptureHealth, CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";

const DEFAULT_MTD_RANGE = (): { start: string; end: string } => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

export function buildApplicantCaptureHealth(input: {
  store: CandidateIngestionStoreFile;
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  referenceBreezyMtd?: number;
  rangeStart?: string;
  rangeEnd?: string;
}): ApplicantCaptureHealth {
  const range = {
    start: input.rangeStart ?? DEFAULT_MTD_RANGE().start,
    end: input.rangeEnd ?? DEFAULT_MTD_RANGE().end,
  };
  const candidates = listIngestedCandidates(input.store);
  const mtdCandidates = candidates.filter((c) =>
    isAppliedDateInRange(c.appliedDate, range.start, range.end),
  );
  const osApplicantsMtd = mtdCandidates.length;
  const breezyApplicantsMtd = input.referenceBreezyMtd ?? osApplicantsMtd;
  const scannedPositions = new Set(input.store.scannedPositionIds).size;
  const publishedPositions = input.store.publishedPositionsTotal;
  const unscannedPositions = Math.max(0, publishedPositions - scannedPositions);
  const positionCoveragePct = ingestionPositionCoveragePct(input.store);

  let missingWorkflowRecords = 0;
  let unassignedApplicants = 0;
  let withoutP63 = 0;
  let withoutP64 = 0;

  for (const candidate of mtdCandidates) {
    const workflow = input.workflows[candidate.candidateId];
    if (!workflow) {
      missingWorkflowRecords += 1;
      unassignedApplicants += 1;
      withoutP63 += 1;
      withoutP64 += 1;
      continue;
    }
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: input.jobsByPositionId.get(candidate.positionId),
    });
    if (isUnassignedRecruiter(row.assignedRecruiter)) unassignedApplicants += 1;
    if (!row.requiredAction?.trim()) withoutP63 += 1;
    if (!row.recommendedStage?.trim()) withoutP64 += 1;
  }

  const workflowCovered = osApplicantsMtd - missingWorkflowRecords;
  const workflowCoveragePct =
    osApplicantsMtd > 0 ? Math.round((workflowCovered / osApplicantsMtd) * 100) : 100;

  const captureRatePct =
    breezyApplicantsMtd > 0
      ? Math.round((osApplicantsMtd / breezyApplicantsMtd) * 100)
      : osApplicantsMtd > 0
        ? 100
        : 0;

  return {
    breezyApplicantsMtd,
    osApplicantsMtd,
    captureRatePct,
    publishedPositions,
    scannedPositions,
    positionCoveragePct,
    unscannedPositions,
    missingWorkflowRecords,
    workflowCoveragePct,
    unassignedApplicants,
    withoutP63,
    withoutP64,
    lastSyncAt: input.store.lastChunkAt ?? input.store.updatedAt,
    cycleComplete: input.store.cycleComplete,
    ingestionCandidateTotal: candidates.length,
  };
}
