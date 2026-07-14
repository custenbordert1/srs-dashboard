import { readStaleSourceThresholdMs } from "@/lib/p186-6-executive-recruiting-intelligence/flags";
import type { P1866SystemHealth } from "@/lib/p186-6-executive-recruiting-intelligence/types";

export function buildSystemHealth(input: {
  lastBreezyEventAt?: string | null;
  lastWorkflowEventAt?: string | null;
  lastDropboxEventAt?: string | null;
  lastOnboardingEventAt?: string | null;
  lastMelObservationAt?: string | null;
  shadowIngestionLagMs?: number | null;
  reconciliationAgeMs?: number | null;
  storageHealth?: "ok" | "degraded" | "unknown";
  schemaHealth?: "ok" | "degraded" | "unknown";
  nowMs?: number;
}): P1866SystemHealth {
  const now = input.nowMs ?? Date.now();
  const stale = readStaleSourceThresholdMs();
  const missingSourceWarnings: string[] = [];
  const staleDataWarnings: string[] = [];

  const check = (label: string, at: string | null | undefined) => {
    if (!at) {
      missingSourceWarnings.push(`Missing ${label}`);
      return;
    }
    const age = now - Date.parse(at);
    if (!Number.isFinite(age) || age > stale) {
      staleDataWarnings.push(`Stale ${label}`);
    }
  };

  check("Breezy event", input.lastBreezyEventAt);
  check("workflow event", input.lastWorkflowEventAt);
  check("Dropbox event", input.lastDropboxEventAt);
  check("onboarding event", input.lastOnboardingEventAt);
  check("MEL observation", input.lastMelObservationAt);

  if ((input.shadowIngestionLagMs ?? 0) > stale) {
    staleDataWarnings.push("Shadow ingestion lag exceeds threshold");
  }
  if ((input.reconciliationAgeMs ?? 0) > stale) {
    staleDataWarnings.push("Reconciliation age exceeds threshold");
  }

  return {
    lastBreezyEventAt: input.lastBreezyEventAt ?? null,
    lastWorkflowEventAt: input.lastWorkflowEventAt ?? null,
    lastDropboxEventAt: input.lastDropboxEventAt ?? null,
    lastOnboardingEventAt: input.lastOnboardingEventAt ?? null,
    lastMelObservationAt: input.lastMelObservationAt ?? null,
    shadowIngestionLagMs: input.shadowIngestionLagMs ?? null,
    reconciliationAgeMs: input.reconciliationAgeMs ?? null,
    missingSourceWarnings,
    staleDataWarnings,
    storageHealth: input.storageHealth ?? "unknown",
    schemaHealth: input.schemaHealth ?? "ok",
    generatedAt: new Date(now).toISOString(),
  };
}

export function metricsAreConfident(health: P1866SystemHealth): boolean {
  return health.missingSourceWarnings.length === 0 && health.staleDataWarnings.length === 0;
}
