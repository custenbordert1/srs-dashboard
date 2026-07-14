import { randomUUID } from "node:crypto";
import {
  dryRunProductionAdapter,
  evaluateCandidateOutcome,
  isEligibleForCanary,
  type P187ProductionAdapter,
} from "@/lib/p187-hr-to-oa-canary/adapter";
import { readP187Flags } from "@/lib/p187-hr-to-oa-canary/flags";
import { assertAuthorizationMatchesPlan } from "@/lib/p187-hr-to-oa-canary/plan";
import type {
  P187AuditEntry,
  P187CandidateResult,
  P187CandidateSnapshot,
  P187CanaryPlan,
  P187CanaryStatus,
} from "@/lib/p187-hr-to-oa-canary/types";

export type P187CanaryRunResult = {
  ok: boolean;
  status: P187CanaryStatus;
  executedProduction: boolean;
  productionWritesAttempted: number;
  candidatesEvaluated: number;
  candidatesTransitioned: number;
  results: P187CandidateResult[];
  stopReason: string | null;
  audit: P187AuditEntry[];
  paperworkSendsAttempted: 0;
  melExportsAttempted: 0;
  dropboxSignChanges: 0;
  advancedBeyondOperatorApproved: number;
};

function audit(
  action: P187AuditEntry["action"],
  detail: string,
  actor: string,
  candidateId?: string,
): P187AuditEntry {
  return {
    id: `p187-${randomUUID().slice(0, 10)}`,
    at: new Date().toISOString(),
    actor,
    action,
    candidateId,
    detail,
    preserved: true,
  };
}

/**
 * Dry-run canary — simulates the transition path without production writes.
 */
export async function runP187DryRun(input: {
  plan: P187CanaryPlan;
  snapshots: P187CandidateSnapshot[];
  adapter?: P187ProductionAdapter;
  forceFlags?: { canaryFramework: boolean; transitionAuthorityHrToOa: boolean };
}): Promise<P187CanaryRunResult> {
  const flags = readP187Flags(input.forceFlags);
  const actor = input.plan.authorization?.actor ?? "system";
  const entries: P187AuditEntry[] = [
    audit("dry_run", "Starting P187 dry-run", actor),
  ];

  if (!flags.canaryFramework) {
    entries.push(audit("refused_execution", "P187_CANARY_FRAMEWORK off", actor));
    return refused("P187_CANARY_FRAMEWORK flag is off", entries);
  }
  if (!flags.transitionAuthorityHrToOa) {
    entries.push(
      audit("refused_execution", "P187_TRANSITION_AUTHORITY_HR_TO_OA off", actor),
    );
    return refused("P187_TRANSITION_AUTHORITY_HR_TO_OA flag is off", entries);
  }

  const auth = assertAuthorizationMatchesPlan(input.plan);
  if (!auth.ok) {
    entries.push(audit("refused_execution", auth.detail, actor));
    return refused(auth.detail, entries);
  }

  return runCohort({
    plan: input.plan,
    snapshots: input.snapshots,
    adapter: input.adapter ?? dryRunProductionAdapter,
    actor,
    auditLog: entries,
    countProductionWrites: false,
  });
}

/**
 * Production canary execution — REFUSED by default in P187 implementation phase.
 * Requires flags + operator authorization + explicit allowProductionExecution.
 * Even then, callers in this phase must not invoke with allowProductionExecution:true
 * against live production; tests may use injectable adapters only.
 */
export async function executeP187ProductionCanary(input: {
  plan: P187CanaryPlan;
  snapshots: P187CandidateSnapshot[];
  adapter?: P187ProductionAdapter;
  allowProductionExecution?: boolean;
  forceFlags?: Partial<ReturnType<typeof readP187Flags>>;
}): Promise<P187CanaryRunResult> {
  const flags = readP187Flags(input.forceFlags);
  const actor = input.plan.authorization?.actor ?? "system";
  const entries: P187AuditEntry[] = [];

  if (!flags.executeProductionCanary) {
    entries.push(
      audit(
        "refused_execution",
        "P187_EXECUTE_PRODUCTION_CANARY flag is off — wait for explicit operator approval",
        actor,
      ),
    );
    return refused(
      "Production canary execution disabled (P187_EXECUTE_PRODUCTION_CANARY off)",
      entries,
    );
  }

  if (!input.allowProductionExecution) {
    entries.push(
      audit(
        "refused_execution",
        "allowProductionExecution not set — P187 stops before live execution",
        actor,
      ),
    );
    return refused(
      "allowProductionExecution required — P187 does not execute production canary by default",
      entries,
    );
  }

  if (!flags.canaryFramework || !flags.transitionAuthorityHrToOa) {
    return refused("Framework/authority flags required", entries);
  }

  const auth = assertAuthorizationMatchesPlan(input.plan);
  if (!auth.ok) {
    return refused(auth.detail, entries);
  }

  // Still use injectable adapter — never import paperwork/MEL.
  // When a real production adapter is wired later, it must only write approval evidence.
  return runCohort({
    plan: input.plan,
    snapshots: input.snapshots,
    adapter: input.adapter ?? dryRunProductionAdapter,
    actor,
    auditLog: entries,
    countProductionWrites: true,
  });
}

async function runCohort(input: {
  plan: P187CanaryPlan;
  snapshots: P187CandidateSnapshot[];
  adapter: P187ProductionAdapter;
  actor: string;
  auditLog: P187AuditEntry[];
  countProductionWrites: boolean;
}): Promise<P187CanaryRunResult> {
  const byId = new Map(input.snapshots.map((s) => [s.candidateId, s]));
  const results: P187CandidateResult[] = [];
  let stopReason: string | null = null;
  let productionWritesAttempted = 0;
  let advancedBeyond = 0;
  const priorCounts = new Map<string, number>();

  for (const candidateId of input.plan.cohortIds) {
    const snapshot = byId.get(candidateId);
    if (!snapshot) {
      const fail: P187CandidateResult = {
        candidateId,
        ok: false,
        productionBefore: "unknown",
        productionAfter: null,
        lifecycleBefore: "unknown",
        lifecycleAfter: null,
        p186Expected: "OPERATOR_APPROVED",
        mismatch: true,
        duplicateTransition: false,
        skippedTransition: true,
        invalidStateChange: false,
        auditId: null,
        detail: "Missing snapshot for cohort member",
      };
      results.push(fail);
      input.auditLog.push(
        audit("transition_failure", fail.detail, input.actor, candidateId),
      );
      input.auditLog.push(
        audit("stop_on_failure", "Stop on first failure", input.actor, candidateId),
      );
      stopReason = fail.detail;
      break;
    }

    const eligibility = isEligibleForCanary(snapshot);
    if (!eligibility.ok) {
      const fail: P187CandidateResult = {
        candidateId,
        ok: false,
        productionBefore: snapshot.productionBefore,
        productionAfter: null,
        lifecycleBefore: snapshot.lifecycleBefore,
        lifecycleAfter: null,
        p186Expected: "OPERATOR_APPROVED",
        mismatch: true,
        duplicateTransition: false,
        skippedTransition: true,
        invalidStateChange: false,
        auditId: null,
        detail: eligibility.reason,
      };
      results.push(fail);
      input.auditLog.push(
        audit("transition_failure", fail.detail, input.actor, candidateId),
      );
      input.auditLog.push(
        audit("stop_on_failure", "Stop on first failure", input.actor, candidateId),
      );
      stopReason = fail.detail;
      break;
    }

    input.auditLog.push(
      audit("transition_attempt", "Attempting HR→OA", input.actor, candidateId),
    );

    const correlationId = `p187-${randomUUID().slice(0, 8)}`;
    if (input.countProductionWrites) productionWritesAttempted += 1;

    const adapterResult = await input.adapter({
      candidateId,
      actor: input.actor,
      correlationId,
      productionBefore: snapshot.productionBefore,
    });

    const prior = priorCounts.get(candidateId) ?? 0;
    const outcome = evaluateCandidateOutcome({
      snapshot,
      productionAfter: adapterResult.productionAfter,
      lifecycleAfter: adapterResult.lifecycleAfter,
      priorTransitionCount: prior,
    });
    priorCounts.set(candidateId, prior + 1);

    if (outcome.invalidStateChange) advancedBeyond += 1;

    const ok =
      adapterResult.ok &&
      !outcome.mismatch &&
      !outcome.duplicateTransition &&
      !outcome.invalidStateChange &&
      outcome.lifecycleAfter === "OPERATOR_APPROVED";

    const result: P187CandidateResult = {
      ...outcome,
      ok,
      auditId: adapterResult.auditId,
      detail: adapterResult.detail,
    };
    results.push(result);

    if (ok) {
      input.auditLog.push(
        audit("transition_success", adapterResult.detail, input.actor, candidateId),
      );
    } else {
      input.auditLog.push(
        audit("transition_failure", adapterResult.detail, input.actor, candidateId),
      );
      input.auditLog.push(
        audit("stop_on_failure", "Stop on first failure", input.actor, candidateId),
      );
      stopReason = adapterResult.detail || "Transition failed";
      break;
    }
  }

  const transitioned = results.filter((r) => r.ok).length;
  const status: P187CanaryStatus = stopReason
    ? "stopped_on_failure"
    : transitioned === input.plan.cohortIds.length
      ? "dry_run_complete"
      : "stopped_on_failure";

  return {
    ok: !stopReason,
    status,
    executedProduction: input.countProductionWrites,
    productionWritesAttempted: input.countProductionWrites ? productionWritesAttempted : 0,
    candidatesEvaluated: results.length,
    candidatesTransitioned: transitioned,
    results,
    stopReason,
    audit: input.auditLog,
    paperworkSendsAttempted: 0,
    melExportsAttempted: 0,
    dropboxSignChanges: 0,
    advancedBeyondOperatorApproved: advancedBeyond,
  };
}

function refused(detail: string, auditLog: P187AuditEntry[]): P187CanaryRunResult {
  return {
    ok: false,
    status: "refused",
    executedProduction: false,
    productionWritesAttempted: 0,
    candidatesEvaluated: 0,
    candidatesTransitioned: 0,
    results: [],
    stopReason: detail,
    audit: auditLog,
    paperworkSendsAttempted: 0,
    melExportsAttempted: 0,
    dropboxSignChanges: 0,
    advancedBeyondOperatorApproved: 0,
  };
}
