import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { countEligibleForPaperwork } from "@/lib/candidate-onboarding-engine";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { buildExecutionDecisions } from "@/lib/candidate-automation-execution/build-execution-decisions";
import { buildRecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type {
  CandidateGateTrace,
  FunnelGate,
  GateFailureReason,
} from "@/lib/recruiter-replacement-readiness/types";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);
const PAPERWORK_TERMINAL = new Set(["Not Qualified", "Active Rep", "Loaded in MEL", "Ready for MEL"]);

const GATE_ORDER: FunnelGate[] = [
  "mtd_ingested",
  "workflow_sync",
  "p62_assignment",
  "p63_action",
  "p64_progression",
  "p65_2_execution",
  "p65_3_paperwork",
];

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

function hasPublishedJobMatch(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
): boolean {
  return Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
}

function isPaperworkEligible(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
): boolean {
  if (isUnassignedRecruiter(row.assignedRecruiter)) return false;
  if (!row.actionGeneratedAt) return false;
  if (PAPERWORK_TERMINAL.has(row.workflowStatus)) return false;
  if (hasActivePacket(row)) return false;
  if (row.paperworkStatus === "signed") return false;
  if (!row.email?.trim()) return false;
  if (!hasPublishedJobMatch(row, jobsByPositionId)) return false;
  const actionType = row.actionType ?? "none";
  return actionType === "send-paperwork" || actionType === "await-signature";
}

function p62FailureReason(input: {
  candidate: BreezyCandidate;
  workflow?: CandidateWorkflowRecord;
  job?: BreezyJob;
  rosters?: RecruiterRosters;
}): GateFailureReason {
  const { workflow } = input;
  if (workflow && TERMINAL_STATUSES.has(workflow.workflowStatus)) return "terminal_status";
  if (workflow?.recruiterAssignmentSource === "manual" && isUnassignedRecruiter(workflow.assignedRecruiter)) {
    return "manual_recruiter_hold";
  }
  if (!isUnassignedRecruiter(workflow?.assignedRecruiter ?? "")) return "eligible";

  if (input.rosters) {
    const decision = buildRecruiterAssignmentDecision({
      candidate: input.candidate,
      workflow,
      jobState: input.job?.state,
      rosters: input.rosters,
      ownership: new Map(),
    });
    if (decision.reason.includes("Territory state could not be determined")) {
      return "territory_undetermined";
    }
    if (decision.reason.includes("No recruiters available")) return "no_recruiter_roster";
    if (decision.reason.includes("below confidence threshold")) return "assignment_confidence_low";
    if (decision.reason.includes("Terminal workflow")) return "terminal_status";
  }

  return "recruiter_unassigned";
}

function passesGate(
  gate: FunnelGate,
  input: {
    row: ScoredCandidateWorkflowRow;
    candidate: BreezyCandidate;
    workflow?: CandidateWorkflowRecord;
    job?: BreezyJob;
    rosters?: RecruiterRosters;
    jobsByPositionId: Map<string, BreezyJob>;
    escalationDelayHours: number;
  },
): { pass: boolean; reason: GateFailureReason } {
  const { row, workflow } = input;

  switch (gate) {
    case "mtd_ingested":
      return { pass: true, reason: "eligible" };
    case "workflow_sync":
      if (!workflow) return { pass: false, reason: "missing_workflow_record" };
      return { pass: true, reason: "eligible" };
    case "p62_assignment":
      if (!isUnassignedRecruiter(row.assignedRecruiter)) return { pass: true, reason: "eligible" };
      return {
        pass: false,
        reason: p62FailureReason({
          candidate: input.candidate,
          workflow,
          job: input.job,
          rosters: input.rosters,
        }),
      };
    case "p63_action":
      if (!row.actionGeneratedAt || !row.requiredAction?.trim()) {
        return { pass: false, reason: "missing_p63_action" };
      }
      if (!row.actionType || row.actionType === "none") {
        return { pass: false, reason: "p63_action_none" };
      }
      return { pass: true, reason: "eligible" };
    case "p64_progression":
      if (!row.recommendedStage?.trim() && !row.progressionGeneratedAt) {
        return { pass: false, reason: "missing_p64_progression" };
      }
      return { pass: true, reason: "eligible" };
    case "p65_2_execution": {
      const decisions = buildExecutionDecisions({
        candidates: [row],
        escalationDelayHours: input.escalationDelayHours,
      });
      if (decisions.length === 0) return { pass: false, reason: "execution_not_mappable" };
      return { pass: true, reason: "eligible" };
    }
    case "p65_3_paperwork":
      if (PAPERWORK_TERMINAL.has(row.workflowStatus) && row.workflowStatus === "Ready for MEL") {
        return { pass: false, reason: "ready_for_mel_terminal" };
      }
      if (PAPERWORK_TERMINAL.has(row.workflowStatus)) {
        return { pass: false, reason: "terminal_status" };
      }
      if (hasActivePacket(row)) return { pass: false, reason: "active_paperwork_packet" };
      if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
        return { pass: false, reason: "paperwork_already_signed" };
      }
      if (!row.email?.trim()) return { pass: false, reason: "missing_contact_email" };
      if (!hasPublishedJobMatch(row, input.jobsByPositionId)) {
        return { pass: false, reason: "missing_job_match" };
      }
      const actionType = row.actionType ?? "none";
      if (actionType !== "send-paperwork" && actionType !== "await-signature") {
        return { pass: false, reason: "wrong_paperwork_action_type" };
      }
      if (!isPaperworkEligible(row, input.jobsByPositionId)) {
        return { pass: false, reason: "wrong_paperwork_action_type" };
      }
      return { pass: true, reason: "eligible" };
    default:
      return { pass: false, reason: "recruiter_unassigned" };
  }
}

export function traceCandidateFunnelGate(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  workflow?: CandidateWorkflowRecord;
  job?: BreezyJob;
  rosters?: RecruiterRosters;
  jobsByPositionId: Map<string, BreezyJob>;
  escalationDelayHours?: number;
}): CandidateGateTrace {
  const escalationDelayHours = input.escalationDelayHours ?? 48;
  let firstStageReached: FunnelGate = "mtd_ingested";
  let firstStageFailed: FunnelGate | null = null;
  let failureReason: GateFailureReason = "eligible";

  for (const gate of GATE_ORDER) {
    const result = passesGate(gate, { ...input, escalationDelayHours });
    if (!result.pass) {
      firstStageFailed = gate;
      failureReason = result.reason;
      break;
    }
    firstStageReached = gate;
    failureReason = "eligible";
  }

  if (!firstStageFailed && failureReason === "eligible") {
    firstStageReached = "p65_3_paperwork";
  }

  return {
    candidateId: input.row.candidateId,
    firstStageReached,
    firstStageFailed,
    failureReason,
  };
}

export function countPaperworkEligible(
  candidates: ScoredCandidateWorkflowRow[],
): number {
  return countEligibleForPaperwork(candidates);
}

export { GATE_ORDER };
