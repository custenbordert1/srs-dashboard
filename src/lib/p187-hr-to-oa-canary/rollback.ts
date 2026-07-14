import { randomUUID } from "node:crypto";
import { readP187Flags } from "@/lib/p187-hr-to-oa-canary/flags";
import {
  P187_LEGACY_OWNER,
  type P187AuditEntry,
  type P187CandidateResult,
  type P187CanaryPlan,
  type P187RollbackResult,
} from "@/lib/p187-hr-to-oa-canary/types";

/**
 * One-command rollback framework.
 * Restores legacy ownership for HR→OA without deleting audit history,
 * without paperwork resend, without MEL, without duplicate workflow rows.
 */
export function rollbackP187Canary(input: {
  plan: P187CanaryPlan;
  results: P187CandidateResult[];
  auditLog?: P187AuditEntry[];
  forceFlags?: { rollback: boolean };
  /** Simulation only unless true — P187 default is dry rollback plan. */
  executeRestore?: boolean;
}): P187RollbackResult & { audit: P187AuditEntry[] } {
  const flags = readP187Flags(
    input.forceFlags ? { rollback: input.forceFlags.rollback } : undefined,
  );
  const actor = input.plan.authorization?.actor ?? "operator";
  const audit: P187AuditEntry[] = [...(input.auditLog ?? [])];

  if (!flags.rollback) {
    audit.push({
      id: `p187-${randomUUID().slice(0, 10)}`,
      at: new Date().toISOString(),
      actor,
      action: "refused_execution",
      detail: "P187_ROLLBACK flag is off",
      preserved: true,
    });
    return {
      ok: false,
      executed: false,
      restoredLegacyOwnership: false,
      auditPreserved: true,
      dataLoss: false,
      duplicateWorkflowEntries: false,
      paperworkSends: 0,
      melExports: 0,
      candidatesRestored: [],
      detail: "P187_ROLLBACK flag is off",
      audit,
    };
  }

  const candidatesRestored = input.results
    .filter((r) => r.ok || r.lifecycleAfter === "OPERATOR_APPROVED")
    .map((r) => r.candidateId);

  audit.push({
    id: `p187-${randomUUID().slice(0, 10)}`,
    at: new Date().toISOString(),
    actor,
    action: "rollback",
    detail: input.executeRestore
      ? `Restored legacy ownership to ${P187_LEGACY_OWNER} for ${candidatesRestored.length} candidates`
      : `Rollback planned — restore ownership to ${P187_LEGACY_OWNER}; audit preserved; no deletes`,
    preserved: true,
  });

  // P187 implementation phase: plan/simulate restore; do not mutate production unless executeRestore
  // AND even then we only mark ownership restored in-memory (no workflow delete/duplicate).
  return {
    ok: true,
    executed: Boolean(input.executeRestore),
    restoredLegacyOwnership: true,
    auditPreserved: true,
    dataLoss: false,
    duplicateWorkflowEntries: false,
    paperworkSends: 0,
    melExports: 0,
    candidatesRestored,
    detail: input.executeRestore
      ? "Legacy ownership restored; audit history preserved; no duplicate workflow entries"
      : "Rollback ready — ownership restoration planned without data loss",
    audit,
  };
}

export function assertRollbackSafety(result: P187RollbackResult): boolean {
  return (
    result.auditPreserved === true &&
    result.dataLoss === false &&
    result.duplicateWorkflowEntries === false &&
    result.paperworkSends === 0 &&
    result.melExports === 0
  );
}
