import type { SendCycleGateFactorId, SendGateProfile } from "@/lib/p179-operator-controlled-send-gate-profile/types";

/** Operator profile treats these as informational warnings only — not send blockers. */
export const OPERATOR_SOFT_GATE_FACTOR_IDS = new Set<SendCycleGateFactorId>([
  "production_readiness_below_threshold",
  "production_readiness_unavailable",
  "scheduler_not_ready",
  "executive_not_approved",
  "p154_env_disabled",
  "min_wait_since_last_cycle",
  "no_eligible_candidates",
]);

export function isOperatorSoftGateFactor(
  id: SendCycleGateFactorId,
  profile: SendGateProfile,
): boolean {
  return profile === "operator" && OPERATOR_SOFT_GATE_FACTOR_IDS.has(id);
}
