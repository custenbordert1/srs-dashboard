import {
  isForwardProgress,
  isLegalTransition,
} from "@/lib/p186-1-lifecycle-state-machine/states";
import type {
  P186LifecycleState,
  P186ValidationResult,
} from "@/lib/p186-1-lifecycle-state-machine/types";

export type TransitionValidatorInput = {
  fromState: P186LifecycleState | null;
  toState: P186LifecycleState;
  eventSeenBefore?: boolean;
  blockedReason?: string | null;
};

/**
 * Pure transition validator — no I/O, no paperwork side effects.
 */
export function validateTransition(input: TransitionValidatorInput): P186ValidationResult {
  const { fromState, toState } = input;

  if (input.eventSeenBefore) {
    return {
      ok: false,
      code: "duplicate_event",
      fromState,
      toState,
      message: "Duplicate event id — transition already processed.",
    };
  }

  if (fromState === toState) {
    return {
      ok: false,
      code: "noop_same_state",
      fromState,
      toState,
      message: "No-op: candidate already in target state.",
    };
  }

  if (toState === "BLOCKED" && !input.blockedReason?.trim()) {
    return {
      ok: false,
      code: "blocked_without_reason",
      fromState,
      toState,
      message: "BLOCKED requires a blockedReason.",
    };
  }

  if (!isLegalTransition(fromState, toState)) {
    const impossible =
      fromState != null &&
      toState !== "BLOCKED" &&
      fromState !== "BLOCKED" &&
      !isForwardProgress(fromState, toState);
    return {
      ok: false,
      code: impossible ? "impossible_transition" : "illegal_transition",
      fromState,
      toState,
      message: impossible
        ? `Impossible regression/skip: ${fromState} → ${toState}`
        : `Illegal transition: ${fromState ?? "(none)"} → ${toState}`,
    };
  }

  if (
    fromState != null &&
    fromState !== "BLOCKED" &&
    toState !== "BLOCKED" &&
    !isForwardProgress(fromState, toState) &&
    // limited backward edges already in legal set (e.g. HIRING_RECOMMENDATION → RECRUITER_REVIEW)
    !isLegalTransition(fromState, toState)
  ) {
    return {
      ok: false,
      code: "impossible_regression",
      fromState,
      toState,
      message: `Impossible regression: ${fromState} → ${toState}`,
    };
  }

  return {
    ok: true,
    code: "ok",
    fromState,
    toState,
    message: "Transition allowed.",
  };
}
