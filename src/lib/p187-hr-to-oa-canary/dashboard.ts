import {
  P187_CANARY_TRANSITION,
  P187_LEGACY_OWNER,
  P187_P186_OWNER,
  P187_SOURCE_PHASE,
  type P187CanaryStatus,
  type P187CutoverDashboard,
  type P187ReconciliationReport,
} from "@/lib/p187-hr-to-oa-canary/types";
import { readP187Flags } from "@/lib/p187-hr-to-oa-canary/flags";
import type { P187CanaryRunResult } from "@/lib/p187-hr-to-oa-canary/canaryEngine";

export function buildP187CutoverDashboard(input: {
  run?: P187CanaryRunResult | null;
  reconciliation?: P187ReconciliationReport | null;
  canaryStatus?: P187CanaryStatus;
  rollbackReadiness?: boolean;
  forceFlags?: { canaryDashboard: boolean };
}):
  | P187CutoverDashboard
  | { enabled: false; message: string; flags: ReturnType<typeof readP187Flags> } {
  const flags = readP187Flags(
    input.forceFlags ? { canaryDashboard: input.forceFlags.canaryDashboard } : undefined,
  );
  if (!flags.canaryDashboard) {
    return {
      enabled: false,
      message: "P187_CANARY_DASHBOARD flag is off",
      flags,
    };
  }

  const run = input.run;
  const recon = input.reconciliation;
  const evaluated = recon?.candidatesEvaluated ?? run?.candidatesEvaluated ?? 0;
  const transitioned = recon?.candidatesTransitioned ?? run?.candidatesTransitioned ?? 0;
  const successRate =
    recon?.successRate ?? (evaluated === 0 ? 0 : transitioned / evaluated);
  const mismatches = recon?.mismatches ?? run?.results.filter((r) => r.mismatch).length ?? 0;
  const auditGaps = recon?.auditGaps ?? 0;

  return {
    sourcePhase: P187_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    transition: P187_CANARY_TRANSITION,
    candidatesEvaluated: evaluated,
    candidatesTransitioned: transitioned,
    successRate,
    rollbackReadiness: input.rollbackReadiness ?? true,
    legacyOwner: P187_LEGACY_OWNER,
    p186Owner: P187_P186_OWNER,
    mismatches,
    stopReason: run?.stopReason ?? null,
    auditStatus:
      evaluated === 0 ? "not_started" : auditGaps > 0 ? "gaps" : "complete",
    canaryStatus: input.canaryStatus ?? run?.status ?? "planned",
    productionExecutionEnabled: flags.executeProductionCanary,
    safety: {
      paperworkSendsAttempted: 0,
      dropboxSignChanges: 0,
      melExportsAttempted: 0,
      advancedBeyondOperatorApproved: run?.advancedBeyondOperatorApproved ?? 0,
      continuousAutomationEnabled: false,
      schedulerChanged: false,
      otherTransitionsCutover: false,
      productionCanaryExecuted: false,
    },
  };
}

export function buildArchitectureDocument(): {
  title: string;
  transition: string;
  authoritativeOwner: string;
  legacyOwner: string;
  scope: string[];
  outOfScope: string[];
  safetyWalls: string[];
  executionPolicy: string;
} {
  return {
    title: "P187 Controlled Production Lifecycle Cutover — Stage 1 Canary",
    transition: P187_CANARY_TRANSITION,
    authoritativeOwner: P187_P186_OWNER,
    legacyOwner: P187_LEGACY_OWNER,
    scope: [
      "P186 becomes authoritative ONLY for Hiring Recommendation → Operator Approved",
      "Immutable cohort ≤ 5 with explicit operator authorization",
      "Stop on first failure with automatic rollback availability",
      "Reconciliation of legacy vs P186 outcomes",
      "Executive cutover status dashboard (read-only unless flagged)",
    ],
    outOfScope: [
      "All other lifecycle transitions remain on legacy/prior owners",
      "Paperwork send (P184/P185 unchanged)",
      "Dropbox Sign envelope mutations",
      "MEL export",
      "Continuous automation / scheduler changes",
      "Advancement beyond Operator Approved",
    ],
    safetyWalls: [
      "No paperwork sends",
      "No Dropbox Sign changes",
      "No MEL exports",
      "No advancement past Operator Approved",
      "No continuous automation",
      "No scheduler changes",
      "Production canary execute flag default OFF",
      "Do not execute production canary without explicit operator approval",
    ],
    executionPolicy:
      "P187 implements and validates the canary framework only. Production execution requires P187_EXECUTE_PRODUCTION_CANARY + allowProductionExecution + operator authorization. Default path refuses live execution.",
  };
}
