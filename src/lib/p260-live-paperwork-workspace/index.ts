export {
  P260_PHASE,
  P260_SOURCE,
  P260_BY_USER,
  P260_CONFIRMATION_PHRASE,
} from "@/lib/p260-live-paperwork-workspace/types";

export type {
  P260Mode,
  P260TypedConfirmReason,
  P260HardBlocker,
  P260AuditAction,
  P260AuditEntry,
  P260ProductionPreflight,
  P260CandidateSnapshot,
  P260Eligibility,
  P260PreviewResult,
  P260SendResult,
  P260RunInput,
  P260RunDeps,
} from "@/lib/p260-live-paperwork-workspace/types";

export {
  isP260ConfirmationPhrase,
  resolveTypedConfirmReasons,
  typedConfirmationSatisfied,
} from "@/lib/p260-live-paperwork-workspace/confirmation";

export { runP260ProductionPreflight } from "@/lib/p260-live-paperwork-workspace/preflight";
export { evaluateP260Eligibility } from "@/lib/p260-live-paperwork-workspace/eligibility";
export { refreshP260Candidate } from "@/lib/p260-live-paperwork-workspace/refresh";
export {
  buildP260IdempotencyKey,
  acquireP260InFlight,
  releaseP260InFlight,
  clearP260InFlightForTests,
  checkP260ExistingIdempotency,
  recordP260Idempotency,
} from "@/lib/p260-live-paperwork-workspace/idempotency";
export { pushP260Audit, formatP260ActivityTitle } from "@/lib/p260-live-paperwork-workspace/audit";
export {
  previewP260LivePaperworkSend,
  runP260LivePaperworkSend,
} from "@/lib/p260-live-paperwork-workspace/run";
