/**
 * Shared P193 API — safe for Client Components when importing projection/types only.
 * Server persistence lives under `@/lib/p193-simplified-autonomous-lifecycle/server`.
 * Do NOT re-export server store from this barrel.
 */
export {
  P193_SIMPLIFIED_SOURCE_PHASE,
  P193_SIMPLIFIED_SCHEMA_VERSION,
  P193_LIFECYCLE_STATES,
  P193_DASHBOARD_CARDS,
  DEFAULT_P193_FLAGS,
  P193_FORBIDDEN_ACTIONS,
  emptyMetadata,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";
export type {
  P193LifecycleState,
  P193DashboardCard,
  P193AiDecision,
  P193CandidateMetadata,
  P193LifecycleRecord,
  P193ReminderPlan,
  P193Flags,
  P193PaperworkEnvelopeStatus,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";

export {
  isLegalP193Transition,
  assertLegalP193Transition,
  P193_HAPPY_PATH,
  happyPathIndex,
} from "@/lib/p193-simplified-autonomous-lifecycle/stateMachine";

export { createP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";

export {
  evaluateP193AiQualification,
} from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
export type {
  P193AiQualificationInput,
  P193AiQualificationResult,
  P193NearbyJob,
} from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";

export {
  planP193Reminder,
  applyReminderPlanToMetadata,
  mapDropboxEventToPaperworkStatus,
  P193_REMINDER_1H_MS,
  P193_REMINDER_24H_MS,
  P193_REMINDER_48H_MS,
  P193_EXPIRE_7D_MS,
} from "@/lib/p193-simplified-autonomous-lifecycle/reminderEngine";

export {
  mapLegacyWorkflowToP193State,
  mapPaperworkStatusToP193,
  mapStateToDashboardCard,
} from "@/lib/p193-simplified-autonomous-lifecycle/migrationAdapter";

export {
  projectQualifiedToP192Prerequisites,
  assertBridgeSafety,
  P193_BRIDGE_NOTE,
  P193_SYSTEM_RECRUITER,
  P193_RECOMMENDED_STAGE,
} from "@/lib/p193-simplified-autonomous-lifecycle/paperworkBridge";

export { advanceToReadyForAssignment } from "@/lib/p193-simplified-autonomous-lifecycle/readyForAssignment";

export {
  buildP193Dashboard,
  buildP193CandidateTimeline,
} from "@/lib/p193-simplified-autonomous-lifecycle/dashboard";

export {
  applyDropboxEventToP193Record,
  runReminderPass,
} from "@/lib/p193-simplified-autonomous-lifecycle/signatureAdapter";

export {
  projectCandidateRowToP193,
  projectLegacyRowToStatusViewModel,
  toP193CandidateStatusViewModel,
} from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
export type {
  P193CandidateStatusViewModel,
  P193LegacyRowProjectionInput,
} from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";

export { validateP193SimplifiedArchitecture } from "@/lib/p193-simplified-autonomous-lifecycle/validate";
export type { P193ValidationReport } from "@/lib/p193-simplified-autonomous-lifecycle/validate";
