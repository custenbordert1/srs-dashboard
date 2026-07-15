export {
  P204_2_SOURCE_PHASE,
  P204_2_SCHEMA_VERSION,
  P204_2_EXPECTED_COHORT_ID,
  P204_2_EXPECTED_FINGERPRINT,
  P204_2_NOTE_MARKER,
  P204_2_AUTH_EXPIRATION_HOURS,
} from "@/lib/p204-2-controlled-recommendation-approval/types";
export type {
  P2042Authorization,
  P2042EvidenceChecklist,
  P2042OperatorDecisionKind,
  P2042OperatorDecisionRecord,
  P2042ReviewPackage,
} from "@/lib/p204-2-controlled-recommendation-approval/types";

export {
  loadP2042FrozenCohort,
  loadFreezeHashIndex,
  detectStaleMember,
  buildSafetyFlags,
  buildReviewPackage,
} from "@/lib/p204-2-controlled-recommendation-approval/verify";

export {
  FULL_EVIDENCE_CHECKLIST,
  isOverrideDecision,
  isAgreementDecision,
  decidedOutcomeFromDecision,
  evidenceChecklistComplete,
  validateOperatorDecisionInput,
  validateBatchFinalization,
  buildDecisionRecord,
  parseNearestMiles,
} from "@/lib/p204-2-controlled-recommendation-approval/decision";

export { proposeP2042PolicyProxyDecision } from "@/lib/p204-2-controlled-recommendation-approval/policyProxy";

export {
  upsertP2042OperatorDecision,
  listP2042OperatorDecisions,
} from "@/lib/p204-2-controlled-recommendation-approval/store";

export {
  buildAgreementAnalysis,
  buildCalibrationAnalysis,
  buildFuturePilotForecast,
  collectSafetyExceptions,
  confidenceBand,
} from "@/lib/p204-2-controlled-recommendation-approval/metrics";

export {
  newP2042Authorization,
  assertP2042Authorization,
  executeP2042OperatorReviewPilot,
  type P2042ExecutionResult,
} from "@/lib/p204-2-controlled-recommendation-approval/execute";
