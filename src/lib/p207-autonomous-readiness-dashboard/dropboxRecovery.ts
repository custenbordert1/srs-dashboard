import type {
  P207DropboxDiagnostics,
  P207DropboxRecoveryState,
} from "@/lib/p207-autonomous-readiness-dashboard/types";

export type P207QuotaHistory = {
  previousQuota: number | null;
  lastObservedQuota: number | null;
  pilotInProgress: boolean;
  productionSendHealthy: boolean;
};

/**
 * Derive Dropbox recovery UI state. Never triggers P206/P192.
 */
export function deriveP207DropboxRecoveryState(input: {
  dropbox: Omit<
    P207DropboxDiagnostics,
    "recoveryState" | "previousQuota" | "quotaRestoredRecommendP206"
  >;
  history?: P207QuotaHistory | null;
}): {
  recoveryState: P207DropboxRecoveryState;
  previousQuota: number | null;
  quotaRestoredRecommendP206: boolean;
} {
  const d = input.dropbox;
  const history = input.history ?? null;
  const previousQuota = history?.previousQuota ?? null;
  const quota = d.productionQuota;

  if (d.apiStatus === "unknown" || d.configurationStatus === "unknown") {
    return {
      recoveryState: "Configuration Unknown",
      previousQuota,
      quotaRestoredRecommendP206: false,
    };
  }

  if (history?.pilotInProgress) {
    return {
      recoveryState: "Pilot In Progress",
      previousQuota,
      quotaRestoredRecommendP206: false,
    };
  }

  if (history?.productionSendHealthy && quota != null && quota > 0 && !d.vendorBlocked) {
    return {
      recoveryState: "Production Send Healthy",
      previousQuota,
      quotaRestoredRecommendP206: false,
    };
  }

  const restoredFromZero =
    quota != null &&
    quota > 0 &&
    (previousQuota === 0 || (d.vendorBlocked === false && previousQuota != null && previousQuota <= 0));

  // Also treat current quota>0 after known vendor block as restored.
  const currentlyRestored = quota != null && quota > 0 && !d.vendorBlocked;

  if (restoredFromZero || (currentlyRestored && previousQuota === 0)) {
    return {
      recoveryState: "Quota Restored — Pilot Required",
      previousQuota,
      quotaRestoredRecommendP206: true,
    };
  }

  if (d.vendorBlocked || (quota != null && quota <= 0)) {
    return {
      recoveryState: "Vendor Blocked",
      previousQuota,
      quotaRestoredRecommendP206: false,
    };
  }

  if (currentlyRestored) {
    // Quota healthy but no prior history of successful production sends → still pilot required.
    return {
      recoveryState: "Quota Restored — Pilot Required",
      previousQuota,
      quotaRestoredRecommendP206: true,
    };
  }

  return {
    recoveryState: "Configuration Unknown",
    previousQuota,
    quotaRestoredRecommendP206: false,
  };
}

export function withDropboxRecovery(
  dropbox: Omit<
    P207DropboxDiagnostics,
    "recoveryState" | "previousQuota" | "quotaRestoredRecommendP206"
  >,
  history?: P207QuotaHistory | null,
): P207DropboxDiagnostics {
  const recovery = deriveP207DropboxRecoveryState({ dropbox, history });
  return {
    ...dropbox,
    ...recovery,
  };
}
