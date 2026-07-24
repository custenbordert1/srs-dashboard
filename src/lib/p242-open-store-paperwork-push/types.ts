import type { OpenStoreMatchConfidence } from "@/lib/open-stores-paperwork-send/types";

export const P242_PHASE = "P242-open-store-paperwork-push";
export const P242_MAX_BATCH = 10;
export const P242_MAX_MILES = 60;
export const P242_TAYLOR = "Taylor";
export const P242_CONFIRMATION_PHRASE = "SEND 1 PAPERWORK PACKET";

export type P242BlockReason =
  | "already_sent"
  | "already_signed"
  | "ready_for_mel"
  | "active_mel"
  | "duplicate_identity"
  | "missing_email"
  | "unrelated_position"
  | "over_60_miles"
  | "identity_conflict"
  | "terminal_stage"
  | "unsupported_stage"
  | "active_signature"
  | "other";

export type P242Eligibility = "eligible" | "blocked";

export type P242StoreMatch = {
  projectNo: string;
  projectName: string;
  storeCity: string;
  storeState: string;
  storeLabel: string;
  districtManager: string;
  sheetApplicantCount: number;
  breezyPostName: string | null;
  positionId: string | null;
  positionName: string | null;
  matchConfidence: OpenStoreMatchConfidence;
  matchReason: string;
  matchNotes: string[];
};

export type P242CandidateMatch = {
  candidateId: string;
  name: string;
  email: string | null;
  phone: string | null;
  positionId: string | null;
  positionName: string | null;
  storeCity: string;
  storeState: string;
  storeLabel: string;
  districtManager: string;
  homeCity: string | null;
  homeState: string | null;
  breezyStage: string;
  workflowStage: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  actionType: string | null;
  assignedRecruiter: string;
  assignedDM: string;
  matchReason: string;
  matchConfidence: OpenStoreMatchConfidence;
  milesToStore: number | null;
  eligibility: P242Eligibility;
  blockReasons: P242BlockReason[];
  blockDetail: string | null;
  alreadySentExclusion: boolean;
  signedExclusion: boolean;
  canaryKnownSent: boolean;
};

export type P242PreviewSummary = {
  openStoresReviewed: number;
  applicantsFound: number;
  uniqueApplicants: number;
  eligible: number;
  alreadySent: number;
  alreadySigned: number;
  missingEmail: number;
  positionMismatch: number;
  over60Miles: number;
  duplicates: number;
  otherBlocked: number;
  byStore: Array<{
    storeLabel: string;
    districtManager: string;
    applicants: number;
    eligible: number;
    blocked: number;
  }>;
  byDM: Array<{
    districtManager: string;
    applicants: number;
    eligible: number;
    blocked: number;
  }>;
};

export type P242PreviewReport = {
  generatedAt: string;
  phase: typeof P242_PHASE;
  xlsxPath: string;
  dropboxTestMode: boolean | null;
  summary: P242PreviewSummary;
  stores: P242StoreMatch[];
  candidates: P242CandidateMatch[];
  eligibleCandidateIds: string[];
  blockedCandidateIds: string[];
  notes: string[];
  warnings: string[];
};

export type P242AssignmentAuditRow = {
  candidateId: string;
  name: string;
  field: "assignedRecruiter" | "assignedDM";
  before: string;
  after: string;
  applied: boolean;
  reason: string;
};

export type P242SendRow = {
  candidateId: string;
  name: string;
  email: string | null;
  storeLabel: string;
  districtManager: string;
  batchIndex: number;
  attempted: boolean;
  confirmed: boolean;
  failed: boolean;
  failureClass: "candidate" | "system" | null;
  failureReason: string | null;
  signatureRequestId: string | null;
  paperworkStatusAfter: string | null;
  workflowStageAfter: string | null;
  skipReason: string | null;
};

export type P242FinalReport = {
  generatedAt: string;
  phase: typeof P242_PHASE;
  xlsxPath: string;
  mode: "preview_only" | "live_batches";
  dryRun: boolean;
  dropboxTestMode: boolean | null;
  liveWritesOccurred: boolean;
  forceAutoAdvance: boolean;
  forceFreshReset: boolean;
  batchSize: number;
  batchesAttempted: number;
  stoppedOnSystemFailure: boolean;
  systemStopReason: string | null;
  summary: {
    openStoresReviewed: number;
    applicantsFound: number;
    uniqueApplicants: number;
    eligible: number;
    attempted: number;
    confirmedSends: number;
    failed: number;
    alreadySentExclusions: number;
    signedExclusions: number;
    remainingStoresWithNoUsableApplicant: number;
  };
  preview: P242PreviewSummary;
  assignments: P242AssignmentAuditRow[];
  sent: P242SendRow[];
  failed: P242SendRow[];
  storeCoverage: Array<{
    storeLabel: string;
    districtManager: string;
    applicantsFound: number;
    eligible: number;
    confirmedSends: number;
    usableApplicantRemaining: boolean;
  }>;
  notes: string[];
  warnings: string[];
};

export type P242RunOptions = {
  xlsxPath: string;
  dryRun?: boolean;
  confirmLive?: boolean;
  execute?: boolean;
  batchSize?: number;
  forceAutoAdvance?: boolean;
  forceFreshReset?: boolean;
  assignTaylor?: boolean;
  assignDm?: boolean;
  confirmationPhrase?: string;
  /** Approve >60mi candidates by id (empty = none). */
  approveOver60Ids?: string[];
};
