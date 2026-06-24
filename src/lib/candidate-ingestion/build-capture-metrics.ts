import { isAppliedDateInRange } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { currentMtdDateRange, filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { isMtdApplicant } from "@/lib/candidate-ingestion/candidate-queue-scope";
import {
  ingestionPositionCoveragePct,
  listIngestedCandidates,
} from "@/lib/candidate-ingestion/ingestion-store";
import type { ApplicantCaptureHealth, CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

export function buildApplicantCaptureHealth(input: {
  store: CandidateIngestionStoreFile;
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  rosters?: RecruiterRosters;
  referenceBreezyMtd?: number;
  rangeStart?: string;
  rangeEnd?: string;
}): ApplicantCaptureHealth {
  const range = {
    start: input.rangeStart ?? currentMtdDateRange().start,
    end: input.rangeEnd ?? currentMtdDateRange().end,
  };
  const candidates = listIngestedCandidates(input.store);
  const mtdCandidates = filterMtdCandidates(candidates, range);
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
  let p62EligibleMtd = 0;
  let p62EligibleAllIngested = 0;
  let p63EligibleMtd = 0;
  let p64EligibleMtd = 0;
  let p62AssignedMtd = 0;
  let p62AssignedAllIngested = 0;
  let p63WithActionMtd = 0;
  let p64WithProgressionMtd = 0;
  let unassignedHistorical = 0;
  let totalUnassigned = 0;

  for (const candidate of candidates) {
    const workflow = input.workflows[candidate.candidateId];
    const inMtd = isMtdApplicant(candidate, range);
    const terminal = workflow ? TERMINAL_STATUSES.has(workflow.workflowStatus) : false;

    if (!workflow) {
      if (inMtd) {
        missingWorkflowRecords += 1;
        unassignedApplicants += 1;
        withoutP63 += 1;
        withoutP64 += 1;
      }
      totalUnassigned += 1;
      if (!inMtd) unassignedHistorical += 1;
      continue;
    }

    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: input.jobsByPositionId.get(candidate.positionId),
    });
    const assigned = !isUnassignedRecruiter(row.assignedRecruiter);

    if (!terminal) {
      p62EligibleAllIngested += 1;
      if (assigned) p62AssignedAllIngested += 1;
    }

    if (!assigned) {
      totalUnassigned += 1;
      if (!inMtd) unassignedHistorical += 1;
    }

    if (!inMtd) continue;

    if (!terminal) {
      p62EligibleMtd += 1;
      p64EligibleMtd += 1;
    }

    if (assigned) {
      p63EligibleMtd += 1;
      p62AssignedMtd += 1;
      if (!row.requiredAction?.trim()) withoutP63 += 1;
      else p63WithActionMtd += 1;
    } else if (!terminal) {
      unassignedApplicants += 1;
    }

    if (!terminal) {
      if (!row.recommendedStage?.trim()) withoutP64 += 1;
      else p64WithProgressionMtd += 1;
    }
  }

  let p62SkippedBelowConfidence = 0;
  let p62SkippedNoTerritory = 0;
  if (input.rosters && p62EligibleMtd > 0) {
    const decisions = buildRecruiterAssignmentDecisions({
      candidates: mtdCandidates.filter((candidate) => {
        const workflow = input.workflows[candidate.candidateId];
        return workflow && !TERMINAL_STATUSES.has(workflow.workflowStatus);
      }),
      workflows: input.workflows,
      rosters: input.rosters,
      jobsByPositionId: input.jobsByPositionId,
    });
    for (const decision of decisions) {
      if (decision.shouldAssign) continue;
      if (decision.reason.includes("below confidence threshold")) p62SkippedBelowConfidence += 1;
      else if (decision.reason.includes("Territory state could not be determined")) p62SkippedNoTerritory += 1;
    }
  }

  const workflowCovered = osApplicantsMtd - missingWorkflowRecords;
  const workflowCoveragePct =
    osApplicantsMtd > 0 ? Math.round((workflowCovered / osApplicantsMtd) * 100) : 100;
  const p62CoveragePct =
    p62EligibleMtd > 0 ? Math.round((p62AssignedMtd / p62EligibleMtd) * 100) : 100;
  const p62CoverageAllIngestedPct =
    p62EligibleAllIngested > 0
      ? Math.round((p62AssignedAllIngested / p62EligibleAllIngested) * 100)
      : 100;
  const p63CoveragePct =
    p63EligibleMtd > 0 ? Math.round((p63WithActionMtd / p63EligibleMtd) * 100) : 100;
  const p64CoveragePct =
    p64EligibleMtd > 0 ? Math.round((p64WithProgressionMtd / p64EligibleMtd) * 100) : 100;

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
    p62CoveragePct,
    p62CoverageAllIngestedPct,
    p63CoveragePct,
    p64CoveragePct,
    p62EligibleMtd,
    p62EligibleAllIngested,
    p63EligibleMtd,
    p64EligibleMtd,
    p62SkippedBelowConfidence,
    p62SkippedNoTerritory,
    unassignedApplicants,
    unassignedHistorical,
    totalUnassigned,
    withoutP63,
    withoutP64,
    lastSyncAt: input.store.lastChunkAt ?? input.store.updatedAt,
    cycleComplete: input.store.cycleComplete,
    ingestionCandidateTotal: candidates.length,
  };
}
