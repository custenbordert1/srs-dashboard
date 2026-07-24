/** P187.1 — Production canary cohort selection + authorization readiness. */

export {
  P187_1_SOURCE_PHASE,
  P187_1_SCHEMA_VERSION,
  P187_1_TRANSITION,
  P187_1_MAX_COHORT,
  P187_1_AUTH_EXPIRATION_HOURS,
} from "@/lib/p187-1-canary-cohort-readiness/types";
export type {
  P1871GateResult,
  P1871PreflightReport,
  P1871CandidateObservation,
  P1871EligibilityResult,
  P1871CohortMemberPreview,
  P1871ImmutableCohortPreview,
  P1871WriterContainmentPlan,
  P1871DryRunPrediction,
  P1871AuthorizationPackage,
  P1871ReadinessVerdict,
} from "@/lib/p187-1-canary-cohort-readiness/types";

export {
  resolveProductionCommit,
  runProductionPreflight,
} from "@/lib/p187-1-canary-cohort-readiness/preflight";
export type { PreflightDeps } from "@/lib/p187-1-canary-cohort-readiness/preflight";

export {
  redactCandidateId,
  hashCandidateId,
  hasRecommendationEvidence,
  hasApprovalEvidence,
  detectHolds,
  isStale,
  evaluateCandidateEligibility,
  selectEligibleCohort,
} from "@/lib/p187-1-canary-cohort-readiness/eligibility";

export {
  createCanaryId,
  fingerprintCohortMembers,
  finalValidateMember,
  freezeImmutableCohortPreview,
  assertCohortImmutable,
} from "@/lib/p187-1-canary-cohort-readiness/cohortFreeze";

export {
  buildWriterContainmentPlan,
  detectWriterCollision,
  renderWriterContainmentMarkdown,
} from "@/lib/p187-1-canary-cohort-readiness/writerContainment";

export { runFinalCanaryDryRun } from "@/lib/p187-1-canary-cohort-readiness/dryRunPreview";

export {
  buildOperatorAuthorizationPackage,
  isAuthorizationExpired,
  buildExactFlagsReport,
  buildFutureExecutionSequence,
  renderAuthorizationPackageMarkdown,
  determineReadinessVerdict,
} from "@/lib/p187-1-canary-cohort-readiness/authorizationPackage";

export {
  scanWorkflowRecordsForEligibility,
  loadProductionWorkflowsReadonly,
} from "@/lib/p187-1-canary-cohort-readiness/productionScan";
export type { ProductionScanEnrichment } from "@/lib/p187-1-canary-cohort-readiness/productionScan";
