import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { NextBestActionType } from "@/lib/recruiter-action-center/types";

export type NextBestActionRecommendation = {
  action: NextBestActionType;
  label: string;
  reason: string;
  expectedImpact: string;
  relatedNeed: string;
};

const ACTION_LABELS: Record<NextBestActionType, string> = {
  call: "Call",
  text: "Text",
  "send-paperwork": "Send paperwork",
  "follow-up-paperwork": "Follow up paperwork",
  "ready-for-mel": "Mark Ready for MEL",
  "assign-dm": "Assign DM",
  "schedule-follow-up": "Schedule follow-up",
  "re-engage": "Re-engage",
  close: "Close",
};

function relatedStoreNeed(row: ScoredCandidateWorkflowRow, opportunities: MelOpportunity[]): string {
  const code = normalizeStateCode(row.state);
  const open = opportunities.find(
    (opp) => opp.openStatus && !opp.isStaffed && normalizeStateCode(opp.state) === code,
  );
  if (!open) return "Territory coverage gap";
  return `${open.storeName || open.projectName} needs staffing`;
}

export function deriveNextBestAction(input: {
  row: ScoredCandidateWorkflowRow;
  opportunities: MelOpportunity[];
  referenceMs: number;
}): NextBestActionRecommendation {
  const { row, opportunities, referenceMs } = input;
  const need = relatedStoreNeed(row, opportunities);

  if (row.workflowStatus === "Not Qualified" || row.workflowStatus === "Active Rep") {
    return {
      action: "close",
      label: ACTION_LABELS.close,
      reason: "Terminal workflow stage",
      expectedImpact: "Clear queue capacity",
      relatedNeed: need,
    };
  }

  if (isMelReadyStatus(row.workflowStatus) || row.workflowStatus === "Signed") {
    return {
      action: "ready-for-mel",
      label: ACTION_LABELS["ready-for-mel"],
      reason: "Paperwork complete — candidate is placement-ready",
      expectedImpact: "Move candidate into MEL load queue",
      relatedNeed: need,
    };
  }

  if (isPaperworkPendingStatus(row.workflowStatus)) {
    return {
      action: "send-paperwork",
      label: ACTION_LABELS["send-paperwork"],
      reason: "Qualified candidate waiting on onboarding packet",
      expectedImpact: "Accelerate signature and hire conversion",
      relatedNeed: need,
    };
  }

  if (row.workflowStatus === "Paperwork Sent") {
    return {
      action: "follow-up-paperwork",
      label: ACTION_LABELS["follow-up-paperwork"],
      reason: "Packet sent — signature still pending",
      expectedImpact: "Recover stalled paperwork before competitor loss",
      relatedNeed: need,
    };
  }

  if (row.dmNeedsAssignment || (row.recruitingActions.dmReview && !row.assignedDM)) {
    return {
      action: "assign-dm",
      label: ACTION_LABELS["assign-dm"],
      reason: "DM ownership required for territory routing",
      expectedImpact: "Unlock store assignment and interview scheduling",
      relatedNeed: need,
    };
  }

  if (
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    })
  ) {
    return {
      action: row.phone ? "call" : "text",
      label: row.phone ? ACTION_LABELS.call : ACTION_LABELS.text,
      reason: "Follow-up commitment is overdue",
      expectedImpact: "Prevent candidate drop-off and protect placement odds",
      relatedNeed: need,
    };
  }

  if (row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified") {
    return {
      action: "schedule-follow-up",
      label: ACTION_LABELS["schedule-follow-up"],
      reason: "Interview-ready — lock next touch time",
      expectedImpact: "Keep qualified pipeline moving toward paperwork",
      relatedNeed: need,
    };
  }

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    return {
      action: "assign-dm",
      label: "Assign Me",
      reason: "No recruiter owner on an active applicant",
      expectedImpact: "Establish ownership before first outreach",
      relatedNeed: need,
    };
  }

  if (row.recruitingActions.needsFollowUp || row.followUpDueAt) {
    return {
      action: row.phone ? "call" : "text",
      label: row.phone ? ACTION_LABELS.call : ACTION_LABELS.text,
      reason: "Scheduled follow-up due",
      expectedImpact: "Maintain responsiveness and conversion",
      relatedNeed: need,
    };
  }

  return {
    action: "re-engage",
    label: ACTION_LABELS["re-engage"],
    reason: "Candidate aging without recent recruiter touch",
    expectedImpact: "Recover warm applicant before territory gap widens",
    relatedNeed: need,
  };
}
