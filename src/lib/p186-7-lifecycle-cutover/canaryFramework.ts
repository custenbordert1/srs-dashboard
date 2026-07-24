import type {
  P1867CanaryPlan,
  P1867LifecycleTransition,
} from "@/lib/p186-7-lifecycle-cutover/types";
import { readP1867Flags } from "@/lib/p186-7-lifecycle-cutover/flags";

export const P1867_DEFAULT_CANARY_MAX = 5;

/**
 * Transition canary framework — plans only; does not execute production canaries.
 */
export function buildTransitionCanaryPlan(input: {
  transition: P1867LifecycleTransition;
  cohortIds: string[];
  maxCohortSize?: number;
}): P1867CanaryPlan | { ok: false; reason: string } {
  const max = input.maxCohortSize ?? P1867_DEFAULT_CANARY_MAX;
  const unique = [...new Set(input.cohortIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { ok: false, reason: "Empty cohort" };
  if (unique.length > max) {
    return { ok: false, reason: `Cohort exceeds max size ${max}` };
  }
  return {
    transition: input.transition,
    cohortIds: Object.freeze([...unique]) as unknown as string[],
    immutable: true,
    maxCohortSize: max,
    stopOnFirstFailure: true,
    executed: false,
    rollbackAction: `Restore prior production state via rollback writer for ${input.transition}; do not resend paperwork; do not MEL export`,
  };
}

export function assertCanaryImmutable(
  plan: P1867CanaryPlan,
  attemptExpand: string[],
): { ok: boolean; detail: string } {
  const expanded = attemptExpand.some((id) => !plan.cohortIds.includes(id));
  if (expanded || attemptExpand.length !== plan.cohortIds.length) {
    return { ok: false, detail: "Canary cohort is immutable — expansion refused" };
  }
  return { ok: true, detail: "Cohort unchanged" };
}

export function simulateCanaryStopOnFailure(results: Array<{ ok: boolean }>): {
  stopped: boolean;
  processed: number;
  executedProduction: false;
} {
  let processed = 0;
  for (const r of results) {
    processed += 1;
    if (!r.ok) {
      return { stopped: true, processed, executedProduction: false };
    }
  }
  return { stopped: false, processed, executedProduction: false };
}

/**
 * Execute canary — always refused in P186.7 (no production transition canary).
 */
export function executeTransitionCanary(input: {
  plan: P1867CanaryPlan;
  forceFlags?: { transitionCanaryFramework: boolean };
  operatorAuthorized?: boolean;
}): {
  ok: false;
  executed: false;
  productionWritesAttempted: 0;
  detail: string;
} {
  const flags = readP1867Flags(
    input.forceFlags
      ? { transitionCanaryFramework: input.forceFlags.transitionCanaryFramework }
      : undefined,
  );
  if (!flags.transitionCanaryFramework) {
    return {
      ok: false,
      executed: false,
      productionWritesAttempted: 0,
      detail: "P186_TRANSITION_CANARY_FRAMEWORK flag is off",
    };
  }
  if (!input.operatorAuthorized) {
    return {
      ok: false,
      executed: false,
      productionWritesAttempted: 0,
      detail: "Operator authorization required",
    };
  }
  return {
    ok: false,
    executed: false,
    productionWritesAttempted: 0,
    detail: "P186.7 does not execute production transition canaries — stop before Stage 2",
  };
}
