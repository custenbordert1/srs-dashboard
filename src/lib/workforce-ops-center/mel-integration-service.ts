import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildIntegrationPrep, type IntegrationPrepCandidate } from "@/lib/integration-prep";
import { matchCandidateToOpportunities } from "@/lib/mel-matching/matching-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { MelPipelineStatus } from "@/lib/workforce-ops-center/types";

export type MelLoadDispatchRequest = {
  candidateId: string;
  opportunityId?: string | null;
  territory?: string;
  startDate?: string;
};

export type MelLoadDispatchResult = {
  status: "queued" | "stub" | "ready";
  channel: "mel-writeback-api";
  message: string;
  payload: Record<string, string>;
};

export type MelIntegrationReadiness = {
  melReady: boolean;
  missingFields: string[];
  topOpportunityId: string | null;
  topProjectName: string | null;
  fitPercent: number | null;
  pipelineStatus: MelPipelineStatus;
};

function toPrepCandidate(candidate: BreezyCandidate): IntegrationPrepCandidate {
  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    positionName: candidate.positionName,
    city: candidate.city,
    state: candidate.state,
  };
}

export function assessMelIntegrationReadiness(
  candidate: BreezyCandidate,
  workflow: CandidateWorkflowRecord | undefined,
  opportunities: MelOpportunity[],
  referenceMs: number,
): MelIntegrationReadiness {
  const row = buildBaselineWorkflowRow(candidate, workflow);
  const prep = buildIntegrationPrep(toPrepCandidate(candidate), row.workflowStatus);
  const melPrep = prep.find((item) => item.id === "mel");
  const melReady = melPrep?.ready ?? false;

  const match = matchCandidateToOpportunities(candidate, opportunities.filter((o) => o.openStatus), {
    limit: 1,
  });
  const top = match.matches[0];

  let pipelineStatus: MelPipelineStatus = "stalled";
  if (row.workflowStatus === "Loaded in MEL" || row.workflowStatus === "Active Rep") {
    pipelineStatus = "completed";
  } else if (row.workflowStatus === "Ready for MEL") {
    pipelineStatus = top ? "assigned" : "ready";
  } else if (melReady) {
    pipelineStatus = "push-pending";
  } else if (
    row.workflowStatus === "Signed" ||
    row.workflowStatus === "Awaiting DD Verification"
  ) {
    pipelineStatus = "ready";
  }

  const applied = Date.parse(candidate.appliedDate);
  const daysInPipeline = Number.isNaN(applied)
    ? null
    : Math.max(0, Math.round((referenceMs - applied) / (24 * 60 * 60 * 1000)));

  if (pipelineStatus !== "completed" && daysInPipeline !== null && daysInPipeline >= 21) {
    pipelineStatus = "stalled";
  }

  return {
    melReady,
    missingFields: melPrep?.missingFields ?? [],
    topOpportunityId: top?.opportunityId ?? null,
    topProjectName: top?.projectName ?? null,
    fitPercent: top?.fitPercent ?? null,
    pipelineStatus,
  };
}

/**
 * Future-ready MEL writeback facade — queues payload for downstream worker.
 */
export function buildMelLoadDispatch(
  candidate: BreezyCandidate,
  request: MelLoadDispatchRequest,
): MelLoadDispatchResult {
  return {
    status: "stub",
    channel: "mel-writeback-api",
    message: "MEL load queued for writeback worker (stub).",
    payload: {
      candidateId: request.candidateId,
      opportunityId: request.opportunityId ?? "",
      territory: request.territory ?? candidate.state,
      startDate: request.startDate ?? new Date().toISOString().slice(0, 10),
      repName: `${candidate.firstName} ${candidate.lastName}`.trim(),
      email: candidate.email,
      phone: candidate.phone,
      positionName: candidate.positionName,
    },
  };
}

export const MEL_INTEGRATION_CAPABILITIES = {
  writebackApi: "stub",
  repQualityScoring: "planned",
  projectCompletionTracking: "sheet-derived",
} as const;
