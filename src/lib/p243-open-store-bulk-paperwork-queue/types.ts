export const P243_OSBPQ_PHASE = "P243-open-store-bulk-paperwork-queue";
export const P243_OSBPQ_BATCH_SIZE = 5;
export const P243_OSBPQ_MAX_MILES = 60;
export const P243_OSBPQ_SAFETY_RESERVE = 5;
export const P243_OSBPQ_CONFIRMATION_PHRASE = "SEND 1 PAPERWORK PACKET";
export const P243_OSBPQ_DEFAULT_SAFE_SEND_CAP = 25;

/** Known canary + P242 open-store push sends — must exclude. */
export const P243_OSBPQ_KNOWN_SENT_IDS = new Set([
  // Canary
  "f84925d2226a", // Ashley Nicole cross
  "8b248f4f045c", // Shanyn Pough
  "8e51a3531ac4", // Diandra Martinez
  // P242 confirmed sends
  "5ce3cbc6db69", // Ashley Flannory
  "19225529be65", // Tina McMillan
  "e5f4cbf3d07b", // Angela Price
  "70ae687c9907", // Janet Mitchell
  "cfe8f8046aa4", // Yvette Sumter-Rawls
  "e6b1bd921fad", // MICHAEL MENDIOLA
  "e3ed2f7a8040", // Robert Stutts
  "d21438efb142", // cher whetstone
  "900df6399db7", // Stephen Brooks
  "80b3b52e3969", // iesha Pennington
  "6dfd66cfe4ab", // Christina Lehman
  "86dcff3a24ec", // Nevaeh cunningham
  "cc91b8619d2a", // Katelyn Coursey
  "244a94a0650c", // Anna Ray
  // P243 OSBPQ confirmed (this phase)
  "29ea867bdd60", // Diana Porter
  "7c5fe50cc3ad", // Tracy Hedderman
  "073762ce7034", // Andrew Barnes
  "6d157217ddcd", // Elizabeth Odger
  "2e4ef6f53dfd", // Johnna Belton
  "5802f542513a", // Thomas Hafley
  "4099cfcc2bb5", // James Daniels
]);

export type P243OsbpqBlockReason =
  | "unresolved"
  | "ambiguous_match"
  | "already_sent"
  | "already_signed"
  | "ready_for_mel"
  | "active_mel"
  | "duplicate_identity"
  | "invalid_email"
  | "inactive_position"
  | "wrong_project"
  | "not_qualified"
  | "over_60_miles"
  | "identity_conflict"
  | "terminal_stage"
  | "unsupported_stage"
  | "active_signature"
  | "other";

export type P243OsbpqEligibility = "eligible" | "blocked";

export type P243OsbpqDistanceTier = "tier1_0_20" | "tier2_21_39" | "tier3_40_60" | "over_60" | "unknown";

export type P243OsbpqSheetRow = {
  rowIndex: number;
  candidateName: string;
  email: string | null;
  phone: string | null;
  position: string;
  matchingOpenStore: string;
  storeNumber: string;
  project: string;
  cityState: string;
  storeCity: string;
  storeState: string;
  candidateCity: string;
  candidateState: string;
  sheetStage: string;
};

export type P243OsbpqMatchMethod =
  | "breezy_id"
  | "normalized_email"
  | "phone_name"
  | "name_position"
  | "none";

export type P243OsbpqQueueItem = {
  candidateId: string;
  name: string;
  email: string | null;
  phone: string | null;
  positionId: string | null;
  positionName: string | null;
  storeLabel: string;
  storeNumber: string;
  project: string;
  storeCity: string;
  storeState: string;
  homeCity: string | null;
  homeState: string | null;
  breezyStage: string;
  workflowStage: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  actionType: string | null;
  assignedRecruiter: string;
  assignedDM: string;
  matchMethod: P243OsbpqMatchMethod;
  matchConfidence: "high" | "medium" | "low" | "none";
  milesToStore: number | null;
  distanceTier: P243OsbpqDistanceTier;
  appliedAt: string | null;
  eligibility: P243OsbpqEligibility;
  blockReasons: P243OsbpqBlockReason[];
  blockDetail: string | null;
  alreadySentExclusion: boolean;
  signedExclusion: boolean;
  knownPriorSend: boolean;
  storeHasAssignedCandidate: boolean;
  idempotencyKey: string;
  queuePriority: number;
  sheetRowIndex: number;
};

export type P243OsbpqCapacityProbe = {
  probedAt: string;
  confirmed: boolean;
  source: "account_quota" | "rate_limit_header" | "configured_cap" | "unconfirmed";
  apiRequestsRemaining: number | null;
  rateLimitRemaining: number | null;
  inFlightLocal: number;
  safetyReserve: number;
  configuredSafeSendCap: number | null;
  safeCapacity: number | null;
  stopAfterPreview: boolean;
  limitationNotes: string[];
  accountEmail: string | null;
  detail: string;
};

export type P243OsbpqPreviewSummary = {
  reviewed: number;
  eligible: number;
  alreadySent: number;
  alreadySigned: number;
  duplicates: number;
  invalidEmail: number;
  blocked: number;
  ambiguous: number;
  unresolved: number;
  apiRemaining: number | null;
  safeCapacity: number | null;
  wouldSend: number;
  deferred: number;
};

export type P243OsbpqPreviewReport = {
  generatedAt: string;
  phase: typeof P243_OSBPQ_PHASE;
  xlsxPath: string;
  dropboxTestMode: boolean | null;
  capacity: P243OsbpqCapacityProbe;
  summary: P243OsbpqPreviewSummary;
  queue: P243OsbpqQueueItem[];
  eligibleIds: string[];
  deferredIds: string[];
  blockedIds: string[];
  notes: string[];
  warnings: string[];
};

export type P243OsbpqSendRow = {
  candidateId: string;
  name: string;
  email: string | null;
  storeLabel: string;
  storeNumber: string;
  project: string;
  distanceTier: P243OsbpqDistanceTier;
  idempotencyKey: string;
  batchIndex: number;
  attempted: boolean;
  confirmed: boolean;
  failed: boolean;
  deferred: boolean;
  deferReason: string | null;
  failureClass: "candidate" | "system" | null;
  failureReason: string | null;
  signatureRequestId: string | null;
  paperworkStatusAfter: string | null;
  workflowStageAfter: string | null;
  skipReason: string | null;
};

export type P243OsbpqFinalReport = {
  generatedAt: string;
  phase: typeof P243_OSBPQ_PHASE;
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
  capacity: P243OsbpqCapacityProbe;
  summary: {
    reviewed: number;
    eligible: number;
    alreadySent: number;
    alreadySigned: number;
    duplicates: number;
    invalidEmail: number;
    blocked: number;
    apiRemaining: number | null;
    safeCapacity: number | null;
    wouldSend: number;
    attempted: number;
    confirmedSends: number;
    deferred: number;
    failed: number;
  };
  preview: P243OsbpqPreviewSummary;
  confirmed: P243OsbpqSendRow[];
  deferred: P243OsbpqSendRow[];
  failures: P243OsbpqSendRow[];
  notes: string[];
  warnings: string[];
};

export type P243OsbpqRunOptions = {
  xlsxPath: string;
  dryRun?: boolean;
  confirmLive?: boolean;
  execute?: boolean;
  batchSize?: number;
  forceAutoAdvance?: boolean;
  forceFreshReset?: boolean;
  confirmationPhrase?: string;
  approveOver60Ids?: string[];
};
