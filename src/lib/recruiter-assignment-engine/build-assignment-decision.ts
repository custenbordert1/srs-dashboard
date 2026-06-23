import type { BreezyCandidate } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { resolveCandidateState } from "@/lib/candidate-dm-suggest";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import {
  RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD,
  type RecruiterAssignmentDecision,
} from "@/lib/recruiter-assignment-engine/types";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

type OwnershipIndex = Map<string, { total: number; byState: Map<string, number> }>;

function listAssignableRecruiters(rosters: RecruiterRosters): string[] {
  const recruiters = rosters.recruiters.filter((name) => !isUnassignedRecruiter(name));
  const named = recruiters.filter((name) => name !== "Recruiting Team");
  return named.length > 0 ? named : recruiters;
}

function buildOwnershipIndex(
  workflows: Record<string, CandidateWorkflowRecord>,
  candidates: BreezyCandidate[],
): OwnershipIndex {
  const candidateState = new Map(candidates.map((c) => [c.candidateId, normalizeStateCode(c.state)]));
  const index: OwnershipIndex = new Map();

  for (const record of Object.values(workflows)) {
    const recruiter = record.assignedRecruiter.trim();
    if (isUnassignedRecruiter(recruiter)) continue;
    const bucket = index.get(recruiter) ?? { total: 0, byState: new Map() };
    bucket.total += 1;
    const state = candidateState.get(record.candidateId);
    if (state) {
      bucket.byState.set(state, (bucket.byState.get(state) ?? 0) + 1);
    }
    index.set(recruiter, bucket);
  }

  return index;
}

function needsAutoAssignment(record: CandidateWorkflowRecord | undefined): boolean {
  if (!record) return true;
  if (record.recruiterAssignmentSource === "manual") return false;
  return isUnassignedRecruiter(record.assignedRecruiter);
}

export function buildRecruiterAssignmentDecision(input: {
  candidate: BreezyCandidate;
  workflow?: CandidateWorkflowRecord;
  jobState?: string;
  rosters: RecruiterRosters;
  ownership: OwnershipIndex;
}): RecruiterAssignmentDecision {
  const { candidate, workflow, jobState, rosters, ownership } = input;
  const candidateId = candidate.candidateId;

  if (workflow && TERMINAL_STATUSES.has(workflow.workflowStatus)) {
    return {
      candidateId,
      recruiter: "",
      confidence: 0,
      reason: "Terminal workflow status — auto-assignment skipped.",
      territoryState: null,
      dmName: null,
      shouldAssign: false,
    };
  }

  if (!needsAutoAssignment(workflow)) {
    return {
      candidateId,
      recruiter: workflow?.assignedRecruiter ?? "",
      confidence: workflow?.recruiterAssignmentConfidence ?? 0,
      reason: "Recruiter already assigned.",
      territoryState: null,
      dmName: null,
      shouldAssign: false,
    };
  }

  const territoryStateRaw = resolveCandidateState({
    candidateState: candidate.state,
    jobState,
  });
  const territoryState = territoryStateRaw ? normalizeStateCode(territoryStateRaw) : "";
  const dmName = territoryState ? (getDmForState(territoryState) ?? null) : null;
  const recruiters = listAssignableRecruiters(rosters);

  if (!territoryState) {
    return {
      candidateId,
      recruiter: "",
      confidence: 0,
      reason: "Territory state could not be determined.",
      territoryState: null,
      dmName,
      shouldAssign: false,
    };
  }

  if (recruiters.length === 0) {
    return {
      candidateId,
      recruiter: "",
      confidence: 0,
      reason: "No recruiters available in roster.",
      territoryState,
      dmName,
      shouldAssign: false,
    };
  }

  const scored = recruiters.map((recruiter) => {
    const owned = ownership.get(recruiter) ?? { total: 0, byState: new Map() };
    const stateOwned = owned.byState.get(territoryState) ?? 0;
    let confidence = 50;
    if (dmName) confidence += 15;
    if (stateOwned > 0) confidence += 20;
    confidence -= Math.min(20, owned.total * 2);
    confidence -= Math.min(10, Math.max(0, stateOwned - 3));
    return { recruiter, confidence, stateOwned, totalOwned: owned.total };
  });

  scored.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      a.totalOwned - b.totalOwned ||
      b.stateOwned - a.stateOwned ||
      a.recruiter.localeCompare(b.recruiter),
  );

  const best = scored[0]!;
  const confidence = Math.max(0, Math.min(100, Math.round(best.confidence)));

  if (confidence < RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD) {
    return {
      candidateId,
      recruiter: best.recruiter,
      confidence,
      reason: `Best match (${best.recruiter}) below confidence threshold (${confidence}).`,
      territoryState,
      dmName,
      shouldAssign: false,
    };
  }

  const reason =
    best.stateOwned > 0
      ? `Territory match in ${territoryState} — ${best.recruiter} owns ${best.stateOwned} candidate${best.stateOwned === 1 ? "" : "s"} in state.`
      : dmName
        ? `Territory ${territoryState} (${dmName}) — ${best.recruiter} selected by workload balance.`
        : `Territory ${territoryState} — ${best.recruiter} selected by workload balance.`;

  return {
    candidateId,
    recruiter: best.recruiter,
    confidence,
    reason,
    territoryState,
    dmName,
    shouldAssign: true,
  };
}

export function buildRecruiterAssignmentDecisions(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  jobsByPositionId?: Map<string, Pick<BreezyCandidate, "state">>;
}): RecruiterAssignmentDecision[] {
  const ownership = buildOwnershipIndex(input.workflows, input.candidates);
  return input.candidates.map((candidate) =>
    buildRecruiterAssignmentDecision({
      candidate,
      workflow: input.workflows[candidate.candidateId],
      jobState: input.jobsByPositionId?.get(candidate.positionId)?.state,
      rosters: input.rosters,
      ownership,
    }),
  );
}
