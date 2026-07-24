import {
  P260_CONFIRMATION_PHRASE,
  type P260TypedConfirmReason,
} from "@/lib/p260-live-paperwork-workspace/types";

export function isP260ConfirmationPhrase(value: string | null | undefined): boolean {
  return String(value ?? "").trim() === P260_CONFIRMATION_PHRASE;
}

/**
 * Typed confirmation is required for distance 40–60, prior expired packet,
 * manually recovered candidates, or explicit nonstandard override.
 */
export function resolveTypedConfirmReasons(input: {
  nearestMiles: number | null;
  priorExpiredPacket: boolean;
  manuallyRecovered: boolean;
  nonstandardOverride: boolean;
}): P260TypedConfirmReason[] {
  const reasons: P260TypedConfirmReason[] = [];
  if (
    input.nearestMiles != null &&
    input.nearestMiles >= 40 &&
    input.nearestMiles <= 60
  ) {
    reasons.push("distance_40_60");
  }
  if (input.priorExpiredPacket) reasons.push("prior_expired_packet");
  if (input.manuallyRecovered) reasons.push("manually_recovered");
  if (input.nonstandardOverride) reasons.push("nonstandard_override");
  return reasons;
}

export function typedConfirmationSatisfied(input: {
  requiresTypedConfirm: boolean;
  typedConfirmation?: string;
  confirmationPhrase?: string;
}): boolean {
  if (!input.requiresTypedConfirm) {
    return isP260ConfirmationPhrase(input.confirmationPhrase);
  }
  return (
    isP260ConfirmationPhrase(input.typedConfirmation) ||
    isP260ConfirmationPhrase(input.confirmationPhrase)
  );
}
