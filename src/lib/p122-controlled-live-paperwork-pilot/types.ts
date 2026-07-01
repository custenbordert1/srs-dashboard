export const P122_SOURCE_PHASE = "P122";
export const P122_CONFIRMATION_PHRASE = "SEND 1 PAPERWORK PACKET";
export const P122_DEFAULT_PILOT_MAX_SENDS = 1;

export type PilotMappingSource = "native_published_job" | "approved_mapping" | "none";

export type PilotCandidateStatus = "ready_to_send" | "blocked";

export type PilotSafetyCheckId =
  | "pilot_enabled"
  | "live_mode_enabled"
  | "operator_go"
  | "on_allowlist"
  | "not_already_sent"
  | "no_duplicate_risk"
  | "valid_email"
  | "approved_mapping_or_native_project"
  | "pilot_cap_available"
  | "dry_run_false"
  | "confirmation_phrase";

export type PilotSafetyCheck = {
  id: PilotSafetyCheckId;
  label: string;
  passed: boolean;
  detail: string;
};

export type PilotConfig = {
  pilotEnabled: boolean;
  liveModeEnabled: boolean;
  operatorGo: boolean;
  maxSends: number;
  allowlist: string[];
};

export type PilotCandidateEvaluation = {
  candidateId: string;
  candidateName: string;
  email: string;
  allowlisted: boolean;
  status: PilotCandidateStatus;
  safetyChecks: PilotSafetyCheck[];
  blockingReasons: string[];
  projectLabel: string | null;
  templateKey: string | null;
  mappingSource: PilotMappingSource;
  baselineBlocker: string | null;
};

export type PilotSendPacketPreview = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobOrProject: string;
  paperworkTemplate: string;
  safetyChecks: PilotSafetyCheck[];
  auditDestination: string;
};

export type PilotSendRegistryEntry = {
  candidateId: string;
  candidateName: string;
  sentAt: string;
  signatureRequestId: string | null;
  auditEntryId: string | null;
};

export type PilotSendRegistry = {
  version: 1;
  updatedAt: string;
  sendCount: number;
  sends: PilotSendRegistryEntry[];
  lastSendResult: PilotSendResult | null;
};

export type PilotSendResult = {
  executedAt: string;
  candidateId: string;
  candidateName: string;
  outcome: "sent" | "skipped" | "failed" | "simulated" | "not_executed";
  signatureRequestId: string | null;
  error: string | null;
  mode: "dryRun" | "executeOne";
};

export type ControlledLivePaperworkPilotReport = {
  sourcePhase: typeof P122_SOURCE_PHASE;
  generatedAt: string;
  pilotConfig: PilotConfig;
  requiredConfirmationPhrase: typeof P122_CONFIRMATION_PHRASE;
  systemSafetyChecks: PilotSafetyCheck[];
  evaluatedCandidates: PilotCandidateEvaluation[];
  eligiblePilotCandidates: PilotCandidateEvaluation[];
  blockedCandidates: PilotCandidateEvaluation[];
  allowlistedCandidates: PilotCandidateEvaluation[];
  sendPacketPreview: PilotSendPacketPreview | null;
  sendResult: PilotSendResult | null;
  auditRecordPath: string;
  pilotRegistryPath: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  warnings: string[];
};
