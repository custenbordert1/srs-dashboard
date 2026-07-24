import type {
  P207DropboxDiagnostics,
  P207Forecast,
} from "@/lib/p207-autonomous-readiness-dashboard/types";

const SIGN_RATE = 0.55;
const MEL_RATE = 0.85;

/**
 * Operational forecast only — no writes. Assumes Dropbox quota restored unlocks
 * send-ready Paperwork Needed candidates.
 */
export function buildP207Forecast(input: {
  sendReadyCount: number;
  paperworkNeeded: number;
  awaitingSignature: number;
  signedPendingMel: number;
  dropbox: P207DropboxDiagnostics;
}): P207Forecast {
  const unlocked = input.dropbox.vendorBlocked
    ? input.sendReadyCount
    : Math.min(input.sendReadyCount, Math.max(0, input.dropbox.productionQuota ?? input.sendReadyCount));

  const expectedSends = unlocked;
  const expectedSignatures = Math.round(expectedSends * SIGN_RATE);
  const expectedReadyForMel = Math.round(expectedSignatures * MEL_RATE);

  // With quota restored, assume ~40% of unlocked sends happen in 24h, rest over 7d.
  const sends24 = Math.round(expectedSends * 0.4);
  const sig24 = Math.round(sends24 * SIGN_RATE + input.awaitingSignature * 0.15);
  const mel24 = Math.round(sig24 * MEL_RATE + input.signedPendingMel * 0.5);

  const sends7d = expectedSends;
  const sig7d = Math.round(expectedSends * SIGN_RATE + input.awaitingSignature * 0.55);
  const mel7d = Math.round(sig7d * MEL_RATE + input.signedPendingMel * 0.9);

  return {
    ifDropboxRestoredNow: {
      expectedSends,
      expectedSignatures,
      expectedReadyForMel,
    },
    next24h: {
      expectedSends: sends24,
      expectedSignatures: sig24,
      expectedReadyForMel: mel24,
    },
    next7d: {
      expectedSends: sends7d,
      expectedSignatures: sig7d,
      expectedReadyForMel: mel7d,
    },
    assumptions: [
      "No lifecycle or Dropbox writes performed by this forecast.",
      `Signature conversion assumed at ${Math.round(SIGN_RATE * 100)}% of sends.`,
      `Ready-for-MEL conversion assumed at ${Math.round(MEL_RATE * 100)}% of signatures.`,
      input.dropbox.vendorBlocked
        ? "Dropbox currently vendor-blocked (quota≤0); restored-now unlocks send-ready PN cohort."
        : "Dropbox not vendor-blocked; forecast capped by available quota when known.",
      `${input.paperworkNeeded} candidates currently in Paperwork Needed; ${input.sendReadyCount} counted send-ready.`,
    ],
  };
}
