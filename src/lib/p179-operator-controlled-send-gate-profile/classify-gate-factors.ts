import { isOperatorSoftGateFactor } from "@/lib/p179-operator-controlled-send-gate-profile/gate-factor-ids";
import type { SendCycleGateFactor, SendGateProfile } from "@/lib/p179-operator-controlled-send-gate-profile/types";

export function classifySendCycleGateFactors(
  factors: SendCycleGateFactor[],
  profile: SendGateProfile,
): { blockingFactors: string[]; warnings: string[]; pass: boolean } {
  const blockingFactors: string[] = [];
  const warnings: string[] = [];

  for (const factor of factors) {
    if (isOperatorSoftGateFactor(factor.id, profile)) {
      warnings.push(factor.message);
    } else {
      blockingFactors.push(factor.message);
    }
  }

  return {
    blockingFactors,
    warnings,
    pass: blockingFactors.length === 0,
  };
}
