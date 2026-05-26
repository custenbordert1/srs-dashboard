import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export type CandidateQueueActionId =
  | "assign-recruiter"
  | "assign-dm"
  | "apply-suggested-dm"
  | "mark-follow-up"
  | "complete-follow-up"
  | "snooze-24h"
  | "move-paperwork"
  | "ready-mel";

export type CandidateQueueActionPayload =
  | { action: "assign-recruiter"; recruiter: string }
  | { action: "assign-dm"; dm: string }
  | { action: "apply-suggested-dm" }
  | { action: "mark-follow-up" }
  | { action: "complete-follow-up" }
  | { action: "snooze-24h" }
  | { action: "move-paperwork"; status?: "Paperwork Needed" }
  | { action: "ready-mel"; status?: "Ready for MEL" };

export const QUEUE_ACTION_STATUS: Partial<Record<CandidateQueueActionId, CandidateWorkflowStatus>> = {
  "move-paperwork": "Paperwork Needed",
  "ready-mel": "Ready for MEL",
};
