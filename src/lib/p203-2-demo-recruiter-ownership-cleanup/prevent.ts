import type { BreezyOwnershipSignals } from "@/lib/breezy-api";
import { isDemoRecruiterName } from "@/lib/production-recruiter-directory";

export type DemoOwnershipBoundaryResult = {
  appliedRecruiter: string | null;
  rejectedDemo: string | null;
  normalizedToUnassigned: boolean;
  evidencePreserved: string | null;
};

/**
 * Ingestion / merge boundary: demo names never become writable ownership.
 * Preserve the original invalid value for audit evidence when scrubbing.
 */
export function normalizeDemoRecruiterAtIngestionBoundary(
  value: string | null | undefined,
): DemoOwnershipBoundaryResult {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return {
      appliedRecruiter: null,
      rejectedDemo: null,
      normalizedToUnassigned: false,
      evidencePreserved: null,
    };
  }
  if (isDemoRecruiterName(trimmed)) {
    return {
      appliedRecruiter: "Unassigned",
      rejectedDemo: trimmed,
      normalizedToUnassigned: true,
      evidencePreserved: trimmed,
    };
  }
  return {
    appliedRecruiter: trimmed,
    rejectedDemo: null,
    normalizedToUnassigned: false,
    evidencePreserved: null,
  };
}

/**
 * Scrub demo preferred ownership signals without inventing a production owner.
 * Leaves raw owner/assignee/recruiter fields for forensic evidence.
 */
export function scrubDemoOwnershipSignals(
  signals: BreezyOwnershipSignals | null | undefined,
): BreezyOwnershipSignals | null | undefined {
  if (!signals) return signals;
  const preferred = signals.preferredName?.trim() ?? "";
  if (!preferred || !isDemoRecruiterName(preferred)) return signals;
  return {
    ...signals,
    preferredName: null,
  };
}

/**
 * Stale-snapshot protection: a demo incoming never overwrites a valid production owner.
 */
export function shouldRejectDemoOverwrite(input: {
  existingRecruiter: string | null | undefined;
  incomingRecruiter: string | null | undefined;
}): boolean {
  const incoming = input.incomingRecruiter?.trim() ?? "";
  const existing = input.existingRecruiter?.trim() ?? "";
  if (!incoming || !isDemoRecruiterName(incoming)) return false;
  if (!existing || existing === "Unassigned") return true; // still reject write of demo
  return !isDemoRecruiterName(existing);
}
