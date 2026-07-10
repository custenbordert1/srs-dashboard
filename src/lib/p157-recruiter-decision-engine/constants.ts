import type { P157DecisionAction } from "@/lib/p157-recruiter-decision-engine/types";

export const P157_HIGH_CONFIDENCE_THRESHOLD = 80;
export const P157_BLOCKED_ACTIONS = new Set<P157DecisionAction>([
  "Candidate Duplicate",
  "Position Closed",
  "Reject Candidate",
]);

export const P157_ACTION_LABELS: Record<P157DecisionAction, string> = {
  "Send Paperwork": "Send onboarding paperwork",
  "Assign Recruiter": "Assign recruiter",
  "Follow Up Today": "Follow up with candidate today",
  "Wait For Candidate": "Wait for candidate response",
  "Ready For MEL": "Load into MEL",
  "Review Questionnaire": "Review questionnaire responses",
  "Request Missing Documents": "Request missing documents",
  "Escalate To DM": "Escalate to district manager",
  "Position Closed": "Position closed — no action",
  "Candidate Duplicate": "Resolve duplicate candidate",
  "Reject Candidate": "Reject candidate",
  "Manual Review": "Manual recruiter review",
};

export const P157_CLIENT_REQUEST_TIMEOUT_MS = 8_000;

export const P157_CONFIDENCE_BASE: Record<P157DecisionAction, number> = {
  "Send Paperwork": 88,
  "Assign Recruiter": 85,
  "Follow Up Today": 82,
  "Wait For Candidate": 78,
  "Ready For MEL": 90,
  "Review Questionnaire": 74,
  "Request Missing Documents": 76,
  "Escalate To DM": 80,
  "Position Closed": 92,
  "Candidate Duplicate": 94,
  "Reject Candidate": 88,
  "Manual Review": 62,
};
