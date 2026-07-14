import {
  P187_1_AUTH_EXPIRATION_HOURS,
  P187_1_MAX_COHORT,
  P187_1_TRANSITION,
  type P1871AuthorizationPackage,
  type P1871ImmutableCohortPreview,
  type P1871ReadinessVerdict,
  type P1871PreflightReport,
  type P1871DryRunPrediction,
} from "@/lib/p187-1-canary-cohort-readiness/types";

/**
 * Operator authorization package — do not fabricate approval; do not set flags.
 */
export function buildOperatorAuthorizationPackage(input: {
  cohort: P1871ImmutableCohortPreview;
  productionCommit: string;
}): P1871AuthorizationPackage {
  return {
    canaryId: input.cohort.canaryId,
    cohortFingerprint: input.cohort.cohortFingerprint,
    transitionScope: P187_1_TRANSITION,
    maxCohort: P187_1_MAX_COHORT,
    actor: null,
    authorizationTimestamp: null,
    expirationWindowHours: P187_1_AUTH_EXPIRATION_HOURS,
    productionCommit: input.productionCommit,
    expectedCandidateCount: input.cohort.members.length,
    stopConditions: [
      "First candidate failure",
      "Any mismatch vs OPERATOR_APPROVED",
      "Any invalid advancement beyond Operator Approved",
      "Any paperwork/MEL/Dropbox activity",
      "Authorization expired",
      "Cohort fingerprint mismatch",
      "Competing writer collision",
    ],
    rollbackControl:
      "rollbackP187Canary({ plan, results, forceFlags: { rollback: true }, executeRestore: true }) after enabling P187_ROLLBACK only for the rollback window",
    requiredFeatureFlags: [
      "P187_CANARY_FRAMEWORK=1",
      "P187_TRANSITION_AUTHORITY_HR_TO_OA=1",
      "P187_RECONCILIATION=1",
      "P187_ROLLBACK=1",
      "P187_EXECUTE_PRODUCTION_CANARY=1",
    ],
    requiredRuntimeArgument: "allowProductionExecution=true",
    fabricatedApproval: false,
    flagsSet: false,
    operatorApprovalRecorded: false,
  };
}

export function isAuthorizationExpired(input: {
  authorizationTimestamp: string;
  expirationWindowHours?: number;
  nowMs?: number;
}): boolean {
  const hours = input.expirationWindowHours ?? P187_1_AUTH_EXPIRATION_HOURS;
  const start = Date.parse(input.authorizationTimestamp);
  if (!Number.isFinite(start)) return true;
  const now = input.nowMs ?? Date.now();
  return now - start > hours * 60 * 60 * 1000;
}

export function buildExactFlagsReport(): {
  requiredForExecution: Array<{ name: string; required: true; enableNow: false }>;
  dashboardFlagOptional: true;
  allowProductionExecutionRequired: true;
  scopeToProductionOnly: true;
  authorityMustExpireAfterCanary: true;
  enableNow: false;
} {
  return {
    requiredForExecution: [
      { name: "P187_CANARY_FRAMEWORK", required: true, enableNow: false },
      { name: "P187_TRANSITION_AUTHORITY_HR_TO_OA", required: true, enableNow: false },
      { name: "P187_RECONCILIATION", required: true, enableNow: false },
      { name: "P187_ROLLBACK", required: true, enableNow: false },
      { name: "P187_EXECUTE_PRODUCTION_CANARY", required: true, enableNow: false },
    ],
    dashboardFlagOptional: true,
    allowProductionExecutionRequired: true,
    scopeToProductionOnly: true,
    authorityMustExpireAfterCanary: true,
    enableNow: false,
  };
}

export function buildFutureExecutionSequence(): string[] {
  return [
    "1. verify gates",
    "2. confirm cohort fingerprint",
    "3. record authorization",
    "4. contain competing writer for this transition",
    "5. enable scoped authority",
    "6. enable canary execution",
    "7. process one candidate at a time",
    "8. verify production write",
    "9. verify P186 observation",
    "10. verify audit",
    "11. stop on first failure",
    "12. rollback if needed",
    "13. disable authority/execution flags",
    "14. restore legacy writer if contained",
    "15. reconcile all cohort members",
    "16. confirm no other transition changed",
  ];
}

export function renderAuthorizationPackageMarkdown(
  pkg: P1871AuthorizationPackage,
  flags = buildExactFlagsReport(),
  sequence = buildFutureExecutionSequence(),
): string {
  return [
    "# P187.1 Operator Authorization Package",
    "",
    "**Do not fabricate operator approval. Do not set flags in this phase.**",
    "",
    `- **Canary ID:** \`${pkg.canaryId}\``,
    `- **Cohort fingerprint:** \`${pkg.cohortFingerprint}\``,
    `- **Transition scope:** ${pkg.transitionScope}`,
    `- **Max cohort:** ${pkg.maxCohort}`,
    `- **Actor:** ${pkg.actor ?? "(pending operator)"}`,
    `- **Authorization timestamp:** ${pkg.authorizationTimestamp ?? "(pending)"}`,
    `- **Expiration window:** ${pkg.expirationWindowHours} hours after authorization`,
    `- **Production commit:** \`${pkg.productionCommit}\``,
    `- **Expected candidate count:** ${pkg.expectedCandidateCount}`,
    "",
    "## Stop conditions",
    ...pkg.stopConditions.map((s) => `- ${s}`),
    "",
    "## Rollback control",
    "",
    pkg.rollbackControl,
    "",
    "## Required feature flags (later — still OFF now)",
    ...pkg.requiredFeatureFlags.map((f) => `- \`${f}\``),
    "",
    `- Required runtime argument: \`${pkg.requiredRuntimeArgument}\``,
    `- Dashboard flag optional: **${flags.dashboardFlagOptional}** (\`P187_CANARY_DASHBOARD\`)`,
    `- Scope flags to production only: **${flags.scopeToProductionOnly}**`,
    `- Authority must expire after canary: **${flags.authorityMustExpireAfterCanary}**`,
    "",
    "## Future execution sequence (do not run now)",
    ...sequence.map((s) => s),
    "",
    `fabricatedApproval: **${pkg.fabricatedApproval}** · flagsSet: **${pkg.flagsSet}** · operatorApprovalRecorded: **${pkg.operatorApprovalRecorded}**`,
    "",
  ].join("\n");
}

export function determineReadinessVerdict(input: {
  preflight: P1871PreflightReport;
  cohortMemberCount: number;
  dryRun: P1871DryRunPrediction | null;
  cohortFrozen: boolean;
}): P1871ReadinessVerdict {
  if (!input.preflight.allCriticalPassed) return "not_ready";
  if (!input.cohortFrozen || input.cohortMemberCount === 0) return "not_ready";
  if (!input.dryRun?.dryRunOk) return "conditionally_ready";
  if (
    input.dryRun.paperworkSendsPredicted !== 0 ||
    input.dryRun.melWritesPredicted !== 0 ||
    input.dryRun.realProductionWrites !== 0
  ) {
    return "not_ready";
  }
  if (input.dryRun.newlyBlockedCount > 0 || input.dryRun.duplicateConflicts > 0) {
    return "conditionally_ready";
  }
  return "ready_for_operator_authorized_canary";
}
