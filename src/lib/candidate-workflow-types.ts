export type CandidateWorkflowStatus =
  | "Applied"
  | "Needs Review"
  | "Qualified"
  | "Not Qualified"
  | "Paperwork Needed"
  | "Paperwork Sent"
  | "Signed"
  | "Ready for MEL"
  | "Loaded in MEL"
  | "Training Needed"
  | "Active Rep";

export type CandidateWorkflowEvent = {
  id: string;
  type: "status" | "note" | "assignment";
  message: string;
  createdAt: string;
};

export type CandidateWorkflowRecord = {
  candidateId: string;
  workflowStatus: CandidateWorkflowStatus;
  notes: string[];
  assignedDM: string;
  lastActionAt: string | null;
  nextActionNeeded: string;
  history: CandidateWorkflowEvent[];
  updatedAt: string;
};

export type CandidateWorkflowState = Record<string, CandidateWorkflowRecord>;

export const CANDIDATE_WORKFLOW_STATUSES: CandidateWorkflowStatus[] = [
  "Applied",
  "Needs Review",
  "Qualified",
  "Not Qualified",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
];

export function nextActionForWorkflowStatus(status: CandidateWorkflowStatus): string {
  const actions: Record<CandidateWorkflowStatus, string> = {
    Applied: "Review candidate fit",
    "Needs Review": "Review candidate fit",
    Qualified: "Prepare paperwork",
    "Not Qualified": "No action",
    "Paperwork Needed": "Send paperwork placeholder",
    "Paperwork Sent": "Wait for signature",
    Signed: "Verify signed paperwork",
    "Ready for MEL": "Load into MEL",
    "Loaded in MEL": "Monitor placement",
    "Training Needed": "Schedule training",
    "Active Rep": "Monitor field activity",
  };
  return actions[status];
}

export function isCandidateWorkflowStatus(value: string): value is CandidateWorkflowStatus {
  return CANDIDATE_WORKFLOW_STATUSES.includes(value as CandidateWorkflowStatus);
}
