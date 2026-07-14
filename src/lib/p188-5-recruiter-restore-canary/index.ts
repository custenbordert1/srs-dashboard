export {
  P188_5_SOURCE_PHASE,
  P188_5_CANARY_SIZE,
  P188_5_MAX_RECRUITER_WRITES,
} from "@/lib/p188-5-recruiter-restore-canary/types";
export type * from "@/lib/p188-5-recruiter-restore-canary/types";
export { runP1885Preflight, cohortFingerprint } from "@/lib/p188-5-recruiter-restore-canary/preflight";
export {
  freezeP1885CanaryCohort,
  assertCohortImmutable,
  redactCohortForPublic,
  newAuthorization,
} from "@/lib/p188-5-recruiter-restore-canary/freeze";
export {
  executeP1885CanaryRestore,
  type P1885ExecutionResult,
} from "@/lib/p188-5-recruiter-restore-canary/execute";
export {
  runIngestionDurabilityChallenge,
  type P1885IngestionDurabilityReport,
} from "@/lib/p188-5-recruiter-restore-canary/ingestionChallenge";
export { buildRollbackPlanMarkdown } from "@/lib/p188-5-recruiter-restore-canary/rollbackPlan";
