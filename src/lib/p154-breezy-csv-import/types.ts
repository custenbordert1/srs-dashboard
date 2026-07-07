export const P1545_SOURCE_PHASE = "P154.5";
export const P1545_DEFAULT_CSV_PATH = ".data/imports/Breezy 6.1 - 7.7.csv";

export const BREEZY_CSV_HEADERS = [
  "name",
  "email_address",
  "phone_number",
  "address",
  "salary",
  "position",
  "location",
  "stage",
  "source",
  "sourced_by_name",
  "addedDate",
  "addedTime",
  "lastActivityDate",
  "lastActivityTime",
] as const;

export type BreezyCsvImportRowError = {
  row: number;
  message: string;
};

export type BreezyCsvNormalizedRow = {
  rowNumber: number;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  positionName: string;
  positionId: string;
  city: string;
  state: string;
  stage: string;
  source: string;
  addedDate: string;
  lastActivityDate: string;
  matchedExistingByEmail: boolean;
};

export type BreezyCsvImportReport = {
  sourcePhase: typeof P1545_SOURCE_PHASE;
  generatedAt: string;
  csvPath: string;
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  duplicates: number;
  rowErrors: BreezyCsvImportRowError[];
  unmatchedPositions: number;
  mergedIntoStore: number;
  workflowsCreated: number;
  workflowsReconciled: number;
};

export type BreezyCsvPipelineReport = {
  assignment: import("@/lib/p151-autonomous-recruiter-assignment/types").AutonomousRecruiterAssignmentSummary | null;
  paperworkEligibility: import("@/lib/p152-immediate-paperwork-policy/types").ImmediatePaperworkPolicyReport | null;
};

export type BreezyCsvImportFullReport = BreezyCsvImportReport & {
  pipeline: BreezyCsvPipelineReport;
};
