import type { P186LifecycleState } from "@/lib/p186-1-lifecycle-state-machine/types";
import { isLegalTransition } from "@/lib/p186-1-lifecycle-state-machine/states";

export type ShadowProposal = {
  from: P186LifecycleState;
  to: P186LifecycleState;
  legal: boolean;
  reason: string;
};

const ALLOWED: Array<[P186LifecycleState, P186LifecycleState]> = [
  ["PAPERWORK_SENT", "VIEWED"],
  ["VIEWED", "SIGNED"],
  ["PAPERWORK_SENT", "SIGNED"],
  ["SIGNED", "ONBOARDING_COMPLETE"],
  ["ONBOARDING_COMPLETE", "READY_FOR_MEL"],
];

/**
 * Propose shadow-only transitions. Does not mutate production or shadow stores
 * unless an authorized observer later applies via P186.1 after production write.
 */
export function proposeShadowTransition(
  from: P186LifecycleState | null,
  to: P186LifecycleState,
  reason: string,
): ShadowProposal | { ok: false; reason: string } {
  if (!from) {
    return { ok: false, reason: "No current shadow state" };
  }
  const allowed = ALLOWED.some(([a, b]) => a === from && b === to);
  if (!allowed) {
    return { ok: false, reason: `Transition ${from} → ${to} not in P186.5 allowed set` };
  }
  const legal = isLegalTransition(from, to);
  return { from, to, legal, reason };
}

export function listAllowedShadowTransitions(): typeof ALLOWED {
  return ALLOWED;
}
