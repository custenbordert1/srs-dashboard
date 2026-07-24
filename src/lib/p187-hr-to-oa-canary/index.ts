/** P187 — Controlled production lifecycle cutover canary (HR → OA). */

export {
  P187_SOURCE_PHASE,
  P187_SCHEMA_VERSION,
  P187_CANARY_TRANSITION,
  P187_FROM_STATE,
  P187_TO_STATE,
  P187_MAX_COHORT,
  P187_LEGACY_OWNER,
  P187_P186_OWNER,
} from "@/lib/p187-hr-to-oa-canary/types";
export type {
  P187CanaryStatus,
  P187CandidateSnapshot,
  P187CandidateResult,
  P187OperatorAuthorization,
  P187CanaryPlan,
  P187ReconciliationFinding,
  P187ReconciliationReport,
  P187RollbackResult,
  P187CutoverDashboard,
  P187AuditEntry,
} from "@/lib/p187-hr-to-oa-canary/types";

export {
  readP187Flags,
  hasGlobalLifecycleAuthorityFlag,
} from "@/lib/p187-hr-to-oa-canary/flags";
export type { P187Flags } from "@/lib/p187-hr-to-oa-canary/flags";

export {
  cohortFingerprint,
  buildP187CanaryPlan,
  assertCohortImmutable,
  authorizeCanary,
  assertAuthorizationMatchesPlan,
  assertSingleTransitionAuthority,
} from "@/lib/p187-hr-to-oa-canary/plan";

export {
  P187_FORBIDDEN_AFTER_STATUSES,
  mapToLifecycleState,
  isEligibleForCanary,
  detectInvalidAdvancement,
  dryRunProductionAdapter,
  evaluateCandidateOutcome,
} from "@/lib/p187-hr-to-oa-canary/adapter";
export type { P187ProductionAdapter } from "@/lib/p187-hr-to-oa-canary/adapter";

export {
  runP187DryRun,
  executeP187ProductionCanary,
} from "@/lib/p187-hr-to-oa-canary/canaryEngine";
export type { P187CanaryRunResult } from "@/lib/p187-hr-to-oa-canary/canaryEngine";

export { buildReconciliationReport } from "@/lib/p187-hr-to-oa-canary/reconciliation";

export {
  rollbackP187Canary,
  assertRollbackSafety,
} from "@/lib/p187-hr-to-oa-canary/rollback";

export {
  buildP187CutoverDashboard,
  buildArchitectureDocument,
} from "@/lib/p187-hr-to-oa-canary/dashboard";
