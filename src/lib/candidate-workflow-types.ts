import type { CandidateRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";

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
  type: "status" | "note" | "assignment" | "snooze" | "follow_up";
  message: string;
  createdAt: string;
};

export type CandidateWorkflowRecord = {
  candidateId: string;
  workflowStatus: CandidateWorkflowStatus;
  notes: string[];
  assignedRecruiter: string;
  assignedDM: string;
  lastActionAt: string | null;
  nextActionNeeded: string;
  history: CandidateWorkflowEvent[];
  recruitingActions: CandidateRecruitingActions;
  /** ISO datetime when follow-up is due (local overlay). */
  followUpDueAt: string | null;
  /** Hide from my-open until this ISO datetime. */
  snoozedUntil: string | null;
  updatedAt: string;
};

export type RecruiterRosters = {
  recruiters: string[];
  dms: string[];
};

/** On-disk workflow overlay (version 2). */
export type CandidateWorkflowStoreFile = {
  version: 2;
  workflows: CandidateWorkflowState;
  rosters: RecruiterRosters;
  updatedAt: string;
};

export type CandidateWorkflowBundle = {
  workflows: CandidateWorkflowState;
  rosters: RecruiterRosters;
  updatedAt: string;
};

export const DEFAULT_RECRUITER_ROSTER = ["Unassigned", "Taylor", "Recruiting Team"] as const;
export const DEFAULT_DM_ROSTER = ["Unassigned", "Field Ops"] as const;

export function defaultRecruiterRosters(): RecruiterRosters {
  return {
    recruiters: [...DEFAULT_RECRUITER_ROSTER],
    dms: [...DEFAULT_DM_ROSTER],
  };
}

/** Normalize legacy records missing recruiting action flags. */
export function normalizeWorkflowRecord(
  candidateId: string,
  raw: Partial<CandidateWorkflowRecord> & { candidateId?: string },
): CandidateWorkflowRecord {
  const workflowStatus =
    raw.workflowStatus && isCandidateWorkflowStatus(raw.workflowStatus)
      ? raw.workflowStatus
      : "Needs Review";
  return {
    candidateId,
    workflowStatus,
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    assignedRecruiter: raw.assignedRecruiter?.trim() || "Unassigned",
    assignedDM: raw.assignedDM?.trim() || "Unassigned",
    lastActionAt: raw.lastActionAt ?? null,
    nextActionNeeded:
      raw.nextActionNeeded?.trim() || nextActionForWorkflowStatus(workflowStatus),
    history: Array.isArray(raw.history) ? raw.history : [],
    recruitingActions: {
      ...emptyRecruitingActions(),
      ...(raw.recruitingActions && typeof raw.recruitingActions === "object"
        ? raw.recruitingActions
        : {}),
    },
    followUpDueAt: typeof raw.followUpDueAt === "string" ? raw.followUpDueAt : null,
    snoozedUntil: typeof raw.snoozedUntil === "string" ? raw.snoozedUntil : null,
    updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
  };
}

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
