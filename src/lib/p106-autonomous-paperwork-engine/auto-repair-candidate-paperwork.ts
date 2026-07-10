import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { suggestDmForCandidate } from "@/lib/candidate-dm-suggest";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildP84SendQueueEntry } from "@/lib/p84-send-queue-preview/build-p84-send-queue-preview";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildRecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { persistApprovedCandidate } from "@/lib/approval-mode-production/persist-approved-candidate";
import { loadP97State } from "@/lib/approval-mode-production/approval-mode-store";
import type { P62P83ApprovalQueueEntry } from "@/lib/p62-p83-approval-preview/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { simulateApprovalPersistenceRow } from "@/lib/p84-send-queue-preview/build-p84-send-queue-preview";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";

export function buildOwnershipIndex(
  workflows: Record<string, CandidateWorkflowRecord>,
  candidates: BreezyCandidate[],
): Map<string, { total: number; byState: Map<string, number> }> {
  const candidateState = new Map(candidates.map((c) => [c.candidateId, normalizeStateCode(c.state)]));
  const index = new Map<string, { total: number; byState: Map<string, number> }>();
  for (const record of Object.values(workflows)) {
    const recruiter = record.assignedRecruiter.trim();
    if (isUnassignedRecruiter(recruiter)) continue;
    const bucket = index.get(recruiter) ?? { total: 0, byState: new Map() };
    bucket.total += 1;
    const state = candidateState.get(record.candidateId);
    if (state) bucket.byState.set(state, (bucket.byState.get(state) ?? 0) + 1);
    index.set(recruiter, bucket);
  }
  return index;
}

export function buildCandidateApprovalEntry(input: {
  candidate: BreezyCandidate;
  row: ScoredCandidateWorkflowRow;
  workflow: CandidateWorkflowRecord | undefined;
  job: BreezyJob | undefined;
  rosters: RecruiterRosters;
  ownership: Map<string, { total: number; byState: Map<string, number> }>;
}): P62P83ApprovalQueueEntry {
  const p62 = buildRecruiterAssignmentDecision({
    candidate: input.candidate,
    workflow: input.workflow,
    jobState: input.job?.state,
    rosters: input.rosters,
    ownership: input.ownership,
  });

  const assignedRecruiter =
    p62.shouldAssign && p62.recruiter ? p62.recruiter : input.row.assignedRecruiter;
  const suggestedDm = !isUnassignedRecruiter(input.row.suggestedDM)
    ? input.row.suggestedDM
    : suggestDmForCandidate({
        candidateState: input.candidate.state,
        jobState: input.job?.state,
      });

  const name = `${input.candidate.firstName ?? ""} ${input.candidate.lastName ?? ""}`.trim();

  return {
    candidateId: input.candidate.candidateId,
    candidateName: name || input.candidate.email || input.candidate.candidateId,
    positionId: input.candidate.positionId,
    jobTitle: input.candidate.positionName ?? "",
    city: input.candidate.city ?? "",
    state: input.candidate.state ?? "",
    dmTerritory: input.job?.state ?? input.candidate.state ?? "",
    suggestedDm,
    assignedRecruiter: isUnassignedRecruiter(assignedRecruiter) ? "Taylor" : assignedRecruiter,
    confidence: p62.confidence,
    approvalStatus: "pending",
    riskLevel: p62.shouldAssign ? "low" : "medium",
    safeToApprove: true,
    assignmentReason: p62.reason,
    postApprovalSimulation: {
      approvalSimulated: true,
      workflowStatus: "Paperwork Needed",
      actionType: "send-paperwork",
      recruiterAssigned: assignedRecruiter,
      dmAssigned: suggestedDm,
      p84Eligible: true,
      liveSend: false,
      p83Action: "send-paperwork",
      simulationDetail: "P106 autonomous paperwork auto-repair.",
    },
    manualApprovalRequired: true,
    autoApproveBlocked: true,
  };
}

export async function autoRepairCandidatePaperwork(input: {
  candidateId: string;
  candidate: BreezyCandidate;
  row: ScoredCandidateWorkflowRow;
  workflow: CandidateWorkflowRecord | undefined;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
  rosters: RecruiterRosters;
  ownership: Map<string, { total: number; byState: Map<string, number> }>;
  approvedBy: string;
  approvedByUserId: string;
}): Promise<{ repaired: boolean; reason: string | null; rollbackId: string | null }> {
  const email = validateCohortEmail(input.candidate.email ?? "");
  if (!email.valid) {
    return { repaired: false, reason: email.reason ?? "Invalid email.", rollbackId: null };
  }

  const p97State = await loadP97State();
  if (p97State.persisted.some((p) => p.candidateId === input.candidateId)) {
    const afterRow = {
      ...input.row,
      assignedRecruiter: input.row.assignedRecruiter,
      workflowStatus: input.workflow?.workflowStatus === "Paperwork Needed" ? "Paperwork Needed" : input.row.workflowStatus,
    };
    const p84 = buildPaperworkSendEligibility({
      row: afterRow,
      onboarding: input.onboarding,
      jobsByPositionId: input.jobsByPositionId,
    });
    if (p84.eligible) {
      return { repaired: false, reason: "Already in P97 and P84 eligible.", rollbackId: null };
    }
  }

  const approval = buildCandidateApprovalEntry({
    candidate: input.candidate,
    row: input.row,
    workflow: input.workflow,
    job: input.jobsByPositionId.get(input.candidate.positionId),
    rosters: input.rosters,
    ownership: input.ownership,
  });

  const sendEntry = buildP84SendQueueEntry({
    approval,
    row: input.row,
    jobsByPositionId: input.jobsByPositionId,
    onboarding: input.onboarding,
    p84Flags: { ...DEFAULT_P84_FEATURE_FLAGS, liveSend: false },
  });

  if (!sendEntry.inSendQueue || sendEntry.eligibilityResult !== "eligible") {
    return {
      repaired: false,
      reason: sendEntry.sendBlockedReason ?? "Not P84 eligible after simulated repair.",
      rollbackId: null,
    };
  }

  const persisted = await persistApprovedCandidate({
    sendEntry,
    existingWorkflow: input.workflow,
    approvedBy: input.approvedBy,
    approvedByUserId: input.approvedByUserId,
  });

  const sim = simulateApprovalPersistenceRow(input.row, approval);
  const p84After = buildPaperworkSendEligibility({
    row: sim,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  if (!p84After.eligible) {
    return {
      repaired: false,
      reason: p84After.blockingReasons[0] ?? "P84 still blocked after persist.",
      rollbackId: persisted.rollbackId,
    };
  }

  return { repaired: true, reason: null, rollbackId: persisted.rollbackId };
}
