import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { RecruiterInboxSectionId } from "@/lib/recruiter-action-queue-filters";

/** Approval-queue grade weights (score-approval-priority). */
export const APPROVAL_GRADE_SCORE: Record<AiLetterGrade, number> = {
  "A+": 25,
  A: 22,
  B: 15,
  C: 8,
  D: 3,
};

/** Candidate-action-queue grade boost. */
export function queueGradeBoost(grade: string): number {
  if (grade === "A+") return 24;
  if (grade === "A") return 18;
  if (grade === "B") return 8;
  return 0;
}

export const APPROVAL_HIGH_PRIORITY_THRESHOLD = 55;
export const APPROVAL_MEDIUM_PRIORITY_THRESHOLD = 35;

export const COMMAND_CENTER_HIGH_PRIORITY_THRESHOLD = 55;
export const COMMAND_CENTER_MEDIUM_PRIORITY_THRESHOLD = 35;

export const INBOX_SECTION_PRIORITY_SCORE: Record<RecruiterInboxSectionId, number> = {
  "overdue-follow-ups": 6,
  "paperwork-pending": 5,
  "interview-needed": 4,
  "ready-for-mel": 3,
  "newly-applied": 2,
  "everything-else": 1,
};
