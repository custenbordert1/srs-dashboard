import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { dmAssignmentNeedsAttention } from "@/lib/candidate-dm-suggest";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import type { JobStatusReconciliationEntry } from "@/lib/breezy-job-status-reconciliation/types";
import type {
  PublishedJobGateAuditMetrics,
  PublishedJobGateBlocker,
  PublishedJobGateTrace,
} from "@/lib/published-job-gate-audit/types";
import { PUBLISHED_JOB_GATE_BLOCKER_LABELS } from "@/lib/published-job-gate-audit/types";

const TERMINAL_STATUSES = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
]);

const APPLIED_STATUSES = new Set(["Applied", "Needs Review", "Qualified"]);

export function classifyPrimaryBlocker(input: {
  row: ScoredCandidateWorkflowRow;
  p84Eligible: boolean;
  p84FailedGateIds: string[];
  p83ShouldAdvance: boolean;
  p83Action: string;
  jobInPublishedList: boolean;
  jobInLiveFetch: boolean;
  liveJobPublished: boolean;
  positionMatches: boolean;
  onboarding: CandidateOnboardingRecord | null;
}): PublishedJobGateBlocker {
  if (input.p84Eligible) return "p84_eligible_now";

  const { row } = input;
  const haystack = `${row.workflowStatus} ${row.stage}`.toLowerCase();
  const rejected =
    row.workflowStatus === "Not Qualified" ||
    ["rejected", "disqualified", "withdrawn"].some((h) => haystack.includes(h));

  if (TERMINAL_STATUSES.has(row.workflowStatus) || rejected) {
    return "terminal_status";
  }

  if (
    row.workflowStatus === "Paperwork Sent" ||
    row.workflowStatus === "Signed" ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed" ||
    Boolean(row.signatureRequestId)
  ) {
    return "paperwork_already_sent";
  }

  if (input.p84FailedGateIds.includes("no_duplicate")) {
    return "duplicate_candidate";
  }

  if (!row.email?.trim()) {
    return "invalid_email";
  }

  if (input.liveJobPublished && !input.jobInPublishedList) {
    return "data_stale_cache_issue";
  }

  if (!input.positionMatches || !row.positionId?.trim()) {
    return "wrong_position_mapping";
  }

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    return "missing_recruiter_assignment";
  }

  if (row.dmNeedsAssignment || dmAssignmentNeedsAttention(row.assignedDM, row.suggestedDM)) {
    return "missing_dm_assignment";
  }

  if (
    APPLIED_STATUSES.has(row.workflowStatus) &&
    (row.actionType === "screen-candidate" ||
      row.actionType === "needs-review" ||
      row.actionType === "none")
  ) {
    return "candidate_still_in_applied";
  }

  if (
    row.workflowStatus !== "Paperwork Needed" &&
    input.p83Action === "send-paperwork" &&
    input.p83ShouldAdvance
  ) {
    return "p83_did_not_advance";
  }

  return "p84_rule_mismatch";
}

export function blockerReason(
  blocker: PublishedJobGateBlocker,
  input: {
    row: ScoredCandidateWorkflowRow;
    p84BlockingReasons: string[];
    p83Reason: string;
    liveBreezyStatus: string;
  },
): string {
  switch (blocker) {
    case "p84_eligible_now":
      return "All P84 eligibility gates pass — candidate ready for preview send.";
    case "missing_recruiter_assignment":
      return `No recruiter assigned (current: ${input.row.assignedRecruiter || "Unassigned"}).`;
    case "missing_dm_assignment":
      return `DM assignment needed (assigned: ${input.row.assignedDM || "Unassigned"}, suggested: ${input.row.suggestedDM}).`;
    case "candidate_still_in_applied":
      return `Workflow still at ${input.row.workflowStatus} with action ${input.row.actionType ?? "none"}.`;
    case "p83_did_not_advance":
      return input.p83Reason || "P83 advancement not persisted to Paperwork Needed.";
    case "wrong_position_mapping":
      return `Candidate position ${input.row.positionId || "missing"} does not map to published job index.`;
    case "duplicate_candidate":
      return input.p84BlockingReasons.find((r) => r.toLowerCase().includes("duplicate")) ?? "Duplicate paperwork block.";
    case "paperwork_already_sent":
      return `Paperwork already in flight (status: ${input.row.paperworkStatus}, workflow: ${input.row.workflowStatus}).`;
    case "invalid_email":
      return "Missing or invalid candidate email.";
    case "terminal_status":
      return `Terminal workflow status: ${input.row.workflowStatus}.`;
    case "data_stale_cache_issue":
      return `Job is ${input.liveBreezyStatus} in live Breezy but missing from published jobs cache/list.`;
    case "p84_rule_mismatch":
      return input.p84BlockingReasons[0] ?? "P84 gate mismatch — workflow not ready for send.";
    default:
      return "Blocked from P84 eligibility.";
  }
}

export function isFixableWithoutBreezyJobAction(
  blocker: PublishedJobGateBlocker,
  liveJobPublished: boolean,
): boolean {
  if (!liveJobPublished) return false;
  return [
    "missing_recruiter_assignment",
    "missing_dm_assignment",
    "candidate_still_in_applied",
    "p83_did_not_advance",
    "p84_rule_mismatch",
    "invalid_email",
    "data_stale_cache_issue",
    "p84_eligible_now",
  ].includes(blocker);
}

export function shouldRemainBlocked(blocker: PublishedJobGateBlocker): boolean {
  return [
    "terminal_status",
    "duplicate_candidate",
    "paperwork_already_sent",
    "wrong_position_mapping",
  ].includes(blocker);
}

export function buildMetricsFromTraces(traces: PublishedJobGateTrace[]): PublishedJobGateAuditMetrics {
  const primaryBlockerCounts = Object.fromEntries(
    (
      [
        "missing_recruiter_assignment",
        "missing_dm_assignment",
        "candidate_still_in_applied",
        "p83_did_not_advance",
        "wrong_position_mapping",
        "duplicate_candidate",
        "paperwork_already_sent",
        "invalid_email",
        "terminal_status",
        "p84_rule_mismatch",
        "data_stale_cache_issue",
        "p84_eligible_now",
      ] as PublishedJobGateBlocker[]
    ).map((key) => [key, 0]),
  ) as Record<PublishedJobGateBlocker, number>;

  for (const trace of traces) {
    primaryBlockerCounts[trace.primaryBlocker] += 1;
  }

  const positionIds = new Set(traces.map((t) => t.positionId));

  return {
    totalPublishedJobsAudited: positionIds.size,
    candidatesTiedToPublishedJobs: traces.length,
    candidatesP84EligibleNow: traces.filter((t) => t.primaryBlocker === "p84_eligible_now").length,
    candidatesBlockedByP62: traces.filter((t) => t.primaryBlocker === "missing_recruiter_assignment").length,
    candidatesBlockedByP83: traces.filter(
      (t) =>
        t.primaryBlocker === "candidate_still_in_applied" ||
        t.primaryBlocker === "p83_did_not_advance",
    ).length,
    candidatesBlockedByP84: traces.filter(
      (t) =>
        t.primaryBlocker === "p84_rule_mismatch" ||
        t.primaryBlocker === "invalid_email" ||
        t.primaryBlocker === "wrong_position_mapping" ||
        t.primaryBlocker === "data_stale_cache_issue",
    ).length,
    candidatesAlreadyPaperworkSent: traces.filter(
      (t) => t.primaryBlocker === "paperwork_already_sent" || t.primaryBlocker === "duplicate_candidate",
    ).length,
    candidatesFixableWithoutBreezyJobAction: traces.filter((t) => t.fixableWithoutBreezyJobAction).length,
    candidatesShouldRemainBlocked: traces.filter((t) => t.shouldRemainBlocked).length,
    primaryBlockerCounts,
  };
}

export function buildCandidateTrace(input: {
  row: ScoredCandidateWorkflowRow;
  jobEntry: JobStatusReconciliationEntry;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
  paperworkByGrade: PaperworkByGrade;
  recommendedRecruiter: string;
  assignmentConfidence: number | null;
  liveJobPublished: boolean;
}): PublishedJobGateTrace {
  const { row, jobEntry } = input;
  const jobInPublishedList = input.jobsByPositionId.has(jobEntry.positionId);
  const jobInLiveFetch = jobEntry.liveFetchSucceeded;
  const positionMatches = row.positionId === jobEntry.positionId;

  const p83 = buildCandidateAdvancementDecision(row, {
    jobsByPositionId: input.jobsByPositionId,
    paperworkByGrade: input.paperworkByGrade,
    requireApproval: false,
  });

  const p84 = buildPaperworkSendEligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  const p84FailedGateIds = p84.gates.filter((g) => !g.passed).map((g) => g.id);

  const primaryBlocker = classifyPrimaryBlocker({
    row,
    p84Eligible: p84.eligible,
    p84FailedGateIds,
    p83ShouldAdvance: p83.shouldAdvance,
    p83Action: p83.action,
    jobInPublishedList,
    jobInLiveFetch,
    liveJobPublished: input.liveJobPublished,
    positionMatches,
    onboarding: input.onboarding,
  });

  const reason = blockerReason(primaryBlocker, {
    row,
    p84BlockingReasons: p84.blockingReasons,
    p83Reason: p83.reason,
    liveBreezyStatus: jobEntry.breezyPipelineStatus,
  });

  const candidateName = [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || row.candidateId;

  return {
    candidateId: row.candidateId,
    candidateName,
    positionId: jobEntry.positionId,
    jobTitle: jobEntry.jobTitle,
    breezyPositionMapping: {
      positionId: jobEntry.positionId,
      jobInPublishedList,
      jobInLiveFetch,
      liveBreezyStatus: jobEntry.breezyPipelineStatus,
      positionNameMatch: row.positionName.trim() === jobEntry.jobTitle.trim() || Boolean(row.positionName),
    },
    candidateToPosition: {
      candidatePositionId: row.positionId,
      auditedJobPositionId: jobEntry.positionId,
      matches: positionMatches,
    },
    dmTerritory: jobEntry.dmTerritory,
    suggestedDm: row.suggestedDM,
    assignedDm: row.assignedDM,
    dmNeedsAssignment: row.dmNeedsAssignment,
    recruiter: {
      assigned: row.assignedRecruiter,
      recommended: input.recommendedRecruiter,
      assignmentConfidence: input.assignmentConfidence,
      missing: isUnassignedRecruiter(row.assignedRecruiter),
    },
    p83: {
      action: p83.action,
      shouldAdvance: p83.shouldAdvance,
      shouldPersist: p83.shouldPersist,
      reason: p83.reason,
    },
    workflowStatus: row.workflowStatus,
    actionType: row.actionType ?? "none",
    breezyStage: row.stage,
    stageMapping: {
      breezyStage: row.stage,
      localWorkflowStatus: row.workflowStatus,
      expectedAfterP83: "Paperwork Needed",
      aligned: row.workflowStatus === "Paperwork Needed" && row.actionType === "send-paperwork",
    },
    p84: {
      eligible: p84.eligible,
      blockingReasons: p84.blockingReasons,
      failedGateIds: p84FailedGateIds,
    },
    primaryBlocker,
    primaryBlockerLabel: PUBLISHED_JOB_GATE_BLOCKER_LABELS[primaryBlocker],
    blockerReason: reason,
    fixableWithoutBreezyJobAction: isFixableWithoutBreezyJobAction(primaryBlocker, input.liveJobPublished),
    shouldRemainBlocked: shouldRemainBlocked(primaryBlocker),
  };
}
