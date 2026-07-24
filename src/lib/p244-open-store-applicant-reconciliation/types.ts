import type {
  P243OsbpqCapacityProbe,
  P243OsbpqDistanceTier,
  P243OsbpqMatchMethod,
  P243OsbpqQueueItem,
  P243OsbpqSendRow,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

export const P244_OSAR_PHASE = "P244-open-store-applicant-reconciliation";
export const P244_OSAR_BATCH_SIZE = 5;
export const P244_OSAR_SAFETY_RESERVE = 5;
export const P244_OSAR_CONFIRMATION_PHRASE = "SEND 1 PAPERWORK PACKET";

/** Exact 17 categories for the remaining 74 (never generic "blocked"). */
export type P244DispositionCategory =
  | "already_sent"
  | "already_signed"
  | "ready_for_mel"
  | "active_in_mel"
  | "duplicate_candidate"
  | "invalid_or_missing_email"
  | "candidate_not_found"
  | "missing_durable_ingestion"
  | "ambiguous_candidate_match"
  | "inactive_or_archived_position"
  | "location_or_store_mismatch"
  | "over_60_miles"
  | "missing_recruiter"
  | "missing_district_manager"
  | "api_capacity_deferred"
  | "eligible_not_sent"
  | "other_blocked";

/** Marker for the 7 P243 confirmed sends (excluded from remaining-74 categories). */
export type P244RowKind = "p243_confirmed_send" | "remaining";

export type P244SendVerification = {
  verified: boolean;
  signatureRequestId: string | null;
  signerEmailMatch: boolean | null;
  packetStatus: string | null;
  packetCancelledOrInvalid: boolean | null;
  workflowPaperworkSent: boolean;
  breezyStageOk: boolean;
  source: "workflow" | "onboarding" | "pilot" | "known_prior" | "none";
  detail: string;
  reclassifiedTo: P244DispositionCategory | null;
};

export type P244DispositionRow = {
  sheetRowIndex: number;
  candidateName: string;
  candidateEmail: string | null;
  breezyCandidateId: string | null;
  position: string;
  matchingOpenStore: string;
  storeNumber: string;
  project: string;
  breezyStage: string;
  workflowStage: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  previouslySent: boolean;
  sentDuringP243: boolean;
  eligibilityResult: "eligible" | "blocked" | "p243_confirmed";
  reasonNotSent: string | null;
  canBeSentNow: boolean;
  recommendedNextAction: string;
  category: P244DispositionCategory | "p243_confirmed_send";
  rowKind: P244RowKind;
  matchMethod: P243OsbpqMatchMethod | "none";
  milesToStore: number | null;
  distanceTier: P243OsbpqDistanceTier | null;
  assignedRecruiter: string | null;
  assignedDM: string | null;
  sendVerification: P244SendVerification | null;
  recoveryAttempted: boolean;
  recoverySucceeded: boolean;
  recoveryDetail: string | null;
  blockReasons: string[];
  blockDetail: string | null;
  idempotencyKey: string | null;
};

export type P244RecoveredCandidate = {
  sheetRowIndex: number;
  name: string;
  email: string | null;
  phone: string | null;
  breezyCandidateId: string | null;
  recoveryMethod:
    | "normalized_email"
    | "breezy_id"
    | "phone"
    | "name_position"
    | "breezy_api_lookup"
    | "workflow_restore"
    | "none";
  foundInBreezy: boolean;
  workflowCreatedOrRestored: boolean;
  eligibilityAfter: "eligible" | "blocked" | "unknown";
  categoryAfter: P244DispositionCategory | null;
  detail: string;
};

export type P244ConfirmedSend = P243OsbpqSendRow & {
  apiCapacityBefore: number | null;
  apiCapacityAfter: number | null;
  openStore: string;
  phase: typeof P244_OSAR_PHASE;
};

export type P244ReconciliationSummary = {
  totalSpreadsheetApplicants: number;
  p243ConfirmedSends: number;
  remainingApplicantsReviewed: number;
  previouslySentAndVerified: number;
  alreadySigned: number;
  readyForMelOrActiveInMel: number;
  duplicates: number;
  invalidEmails: number;
  missingIngestionCandidates: number;
  recoveredCandidates: number;
  otherBlockedCandidates: number;
  eligibleApplicantsFound: number;
  additionalSendsAttempted: number;
  additionalSendsConfirmed: number;
  deferredDueToApiCapacity: number;
  stillRequiringManualAction: number;
  remainingDropboxSafeCapacity: number | null;
  categoryCounts: Record<P244DispositionCategory, number>;
};

export type P244FullReconciliationReport = {
  generatedAt: string;
  phase: typeof P244_OSAR_PHASE;
  xlsxPath: string;
  mode: "reconcile_only" | "reconcile_and_send";
  dryRun: boolean;
  dropboxTestMode: boolean | null;
  liveWritesOccurred: boolean;
  capacity: P243OsbpqCapacityProbe;
  summary: P244ReconciliationSummary;
  dispositions: P244DispositionRow[];
  remaining74: P244DispositionRow[];
  alreadySentVerified: P244DispositionRow[];
  recovered: P244RecoveredCandidate[];
  eligibleRemaining: P244DispositionRow[];
  newConfirmedSends: P244ConfirmedSend[];
  apiDeferred: P244DispositionRow[];
  stillBlocked: P244DispositionRow[];
  notes: string[];
  warnings: string[];
  stoppedOnSystemFailure: boolean;
  systemStopReason: string | null;
};

export type P244RunOptions = {
  xlsxPath: string;
  dryRun?: boolean;
  confirmLive?: boolean;
  execute?: boolean;
  batchSize?: number;
  forceAutoAdvance?: boolean;
  forceFreshReset?: boolean;
  confirmationPhrase?: string;
  approveOver60Ids?: string[];
  verifyDropbox?: boolean;
};

export type { P243OsbpqQueueItem, P243OsbpqCapacityProbe };
