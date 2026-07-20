export const P217_PHASE = "P217" as const;

export type P217RootCause =
  | "Territory Missing"
  | "DM Lookup Failure"
  | "Assignment Engine Failure"
  | "Workflow Reset"
  | "Sync Failure"
  | "Manual Assignment Required"
  | "Unknown";

export type P217CandidateAuditInput = {
  candidateId: string;
  workflowStage: string;
  assignedDm: string;
  assignedRecruiter: string;
  territory: string;
  expectedDm: string;
  positionId: string;
  positionLookupSucceeded: boolean;
  positionLocationAuthoritative: boolean;
  previousAssignedDm: string | null;
  manualReviewRequired?: boolean;
  syncSuppliedDm?: string | null;
};

export type P217GlobalAuditRow = {
  candidateId: string;
  workflowStage: string;
  assignedDm: string;
  assignedRecruiter: string;
  territory: string;
  expectedDm: string;
  autoAssignable: boolean;
};

export type P217GlobalSummary = {
  totalActiveCandidates: number;
  totalAssignedDm: number;
  totalUnassignedDm: number;
  unassignedByStage: Record<string, number>;
  unassignedByTerritory: Record<string, number>;
  unassignedByRecruiter: Record<string, number>;
  automaticallyAssignable: number;
};
