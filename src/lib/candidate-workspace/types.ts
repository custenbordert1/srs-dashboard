import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type { RecruitingActionType } from "@/lib/candidate-recruiting-actions";

export type WorkspaceActionKind =
  | "contact-candidate"
  | "send-paperwork"
  | "schedule-interview"
  | "review-application"
  | "ready-for-mel"
  | "follow-up"
  | "follow-up-complete"
  | "assign-me";

export type WorkspaceAction = {
  kind: WorkspaceActionKind;
  label: string;
  description: string;
  completeLabel: string;
  tone: "teal" | "amber" | "sky" | "cyan" | "neutral";
  disabled?: boolean;
};

export type CandidateTimelineEntry = {
  id: string;
  label: string;
  detail?: string;
  createdAt: string;
  category: "applied" | "assignment" | "status" | "paperwork" | "communication" | "note" | "other";
};

export type MelReadinessItem = {
  id: string;
  label: string;
  complete: boolean;
};

export type CommunicationLogEntry = {
  id: string;
  channel: "call" | "text" | "email" | "follow-up" | "note" | "other";
  summary: string;
  createdAt: string;
};

export type WorkflowAdvancementResult = {
  statusChange?: CandidateWorkflowStatus;
  recruitingActions?: Array<{ type: RecruitingActionType; enabled: boolean }>;
  completeFollowUp?: boolean;
  note?: string;
};
