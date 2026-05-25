import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isNoResponseCandidate } from "@/lib/recruiter-action-queue-filters";

export type AttentionCueId =
  | "needs-attention"
  | "paperwork-pending"
  | "unassigned"
  | "ready-mel";

export type AttentionCue = {
  id: AttentionCueId;
  label: string;
};

const CUE_PRIORITY: AttentionCueId[] = [
  "needs-attention",
  "paperwork-pending",
  "unassigned",
  "ready-mel",
];

const CUE_LABELS: Record<AttentionCueId, string> = {
  "needs-attention": "Needs attention",
  "paperwork-pending": "Paperwork pending",
  unassigned: "Unassigned",
  "ready-mel": "Ready for MEL",
};

function matchesCue(
  row: ScoredCandidateWorkflowRow,
  id: AttentionCueId,
  referenceMs: number,
): boolean {
  switch (id) {
    case "needs-attention":
      return (
        row.recruitingActions.needsFollowUp ||
        isFollowUpOverdue({
          recruitingActions: row.recruitingActions,
          followUpDueAt: row.followUpDueAt,
          referenceMs,
        }) ||
        isNoResponseCandidate(row, referenceMs)
      );
    case "paperwork-pending":
      return (
        isPaperworkPendingStatus(row.workflowStatus) && row.paperworkStatus !== "signed"
      );
    case "unassigned":
      return isUnassignedRecruiter(row.assignedRecruiter);
    case "ready-mel":
      return isMelReadyStatus(row.workflowStatus);
    default:
      return false;
  }
}

/** Up to two highest-priority operational cues for table scanability. */
export function buildRowAttentionCues(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
  max = 2,
): AttentionCue[] {
  const cues: AttentionCue[] = [];
  for (const id of CUE_PRIORITY) {
    if (matchesCue(row, id, referenceMs)) {
      cues.push({ id, label: CUE_LABELS[id] });
    }
    if (cues.length >= max) break;
  }
  return cues;
}

export const ATTENTION_CUE_STYLES: Record<AttentionCueId, string> = {
  "needs-attention": "border-red-500/40 bg-red-500/10 text-red-100",
  "paperwork-pending": "border-amber-500/40 bg-amber-500/10 text-amber-100",
  unassigned: "border-violet-500/35 bg-violet-500/10 text-violet-100",
  "ready-mel": "border-teal-500/40 bg-teal-500/10 text-teal-100",
};
