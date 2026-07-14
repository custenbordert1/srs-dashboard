import { createHash } from "node:crypto";
import {
  P187_CANARY_TRANSITION,
  P187_LEGACY_OWNER,
  P187_MAX_COHORT,
  P187_P186_OWNER,
  type P187CanaryPlan,
  type P187OperatorAuthorization,
} from "@/lib/p187-hr-to-oa-canary/types";
import { readP187Flags } from "@/lib/p187-hr-to-oa-canary/flags";

export function cohortFingerprint(cohortIds: readonly string[]): string {
  const normalized = [...cohortIds].map((id) => id.trim()).filter(Boolean).sort();
  return createHash("sha256").update(normalized.join("|")).digest("hex").slice(0, 16);
}

/**
 * Build an immutable canary plan for the single allowed transition.
 */
export function buildP187CanaryPlan(input: {
  cohortIds: string[];
  maxCohortSize?: number;
  forceFlags?: { canaryFramework: boolean };
}): P187CanaryPlan | { ok: false; reason: string } {
  const flags = readP187Flags(
    input.forceFlags ? { canaryFramework: input.forceFlags.canaryFramework } : undefined,
  );
  if (!flags.canaryFramework) {
    return { ok: false, reason: "P187_CANARY_FRAMEWORK flag is off" };
  }

  const max = input.maxCohortSize ?? P187_MAX_COHORT;
  if (max > P187_MAX_COHORT) {
    return { ok: false, reason: `Max cohort cannot exceed ${P187_MAX_COHORT}` };
  }

  const unique = [...new Set(input.cohortIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { ok: false, reason: "Empty cohort" };
  if (unique.length > max) {
    return { ok: false, reason: `Cohort exceeds max size ${max}` };
  }

  return {
    transition: P187_CANARY_TRANSITION,
    cohortIds: Object.freeze([...unique]),
    immutable: true,
    maxCohortSize: P187_MAX_COHORT,
    stopOnFirstFailure: true,
    legacyOwner: P187_LEGACY_OWNER,
    p186Owner: P187_P186_OWNER,
    executed: false,
    status: "planned",
    authorization: null,
  };
}

export function assertCohortImmutable(
  plan: P187CanaryPlan,
  attempt: string[],
): { ok: boolean; detail: string } {
  const next = [...new Set(attempt.map((id) => id.trim()).filter(Boolean))];
  if (next.length !== plan.cohortIds.length) {
    return { ok: false, detail: "Cohort size change refused — immutable" };
  }
  if (next.some((id) => !plan.cohortIds.includes(id))) {
    return { ok: false, detail: "Cohort expansion refused — immutable" };
  }
  return { ok: true, detail: "Cohort unchanged" };
}

export function authorizeCanary(input: {
  plan: P187CanaryPlan;
  actor: string;
  reason: string;
  approvedAt?: string;
}): P187CanaryPlan | { ok: false; reason: string } {
  if (!input.actor.trim()) return { ok: false, reason: "Actor required" };
  if (!input.reason.trim()) return { ok: false, reason: "Authorization reason required" };

  const authorization: P187OperatorAuthorization = {
    authorized: true,
    actor: input.actor.trim(),
    approvedAt: input.approvedAt ?? new Date().toISOString(),
    reason: input.reason.trim(),
    cohortFingerprint: cohortFingerprint(input.plan.cohortIds),
  };

  return {
    ...input.plan,
    status: "authorized",
    authorization,
  };
}

export function assertAuthorizationMatchesPlan(
  plan: P187CanaryPlan,
): { ok: boolean; detail: string } {
  if (!plan.authorization?.authorized) {
    return { ok: false, detail: "Operator authorization required" };
  }
  const fp = cohortFingerprint(plan.cohortIds);
  if (fp !== plan.authorization.cohortFingerprint) {
    return { ok: false, detail: "Authorization cohort fingerprint mismatch" };
  }
  return { ok: true, detail: "Authorization matches immutable cohort" };
}

/** P187 owns authority only for this transition — refuse any other. */
export function assertSingleTransitionAuthority(transition: string): boolean {
  return transition === P187_CANARY_TRANSITION;
}
