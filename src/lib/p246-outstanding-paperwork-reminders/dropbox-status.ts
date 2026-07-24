import {
  getSignatureRequest,
  readDropboxSignConfig,
  type DropboxSignRequestSummary,
} from "@/lib/dropbox-sign";
import { invalidateCachedSignatureRequest } from "@/lib/dropbox-sign-api/cache";
import {
  P246_ELIGIBLE_DROPBOX_STATUSES,
  type P246DropboxLiveStatus,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

function normalizeCode(code: string): string {
  return code.trim().toLowerCase().replace(/-/g, "_");
}

/**
 * Map a live Dropbox Sign request to P246 statuses.
 * Fail-closed: unknown codes become "unknown" (not eligible).
 */
export function mapDropboxSummaryToLiveStatus(
  summary: DropboxSignRequestSummary,
): P246DropboxLiveStatus {
  if (summary.isComplete) return "complete";
  if (summary.isDeclined) return "declined";

  const codes = summary.signatures.map((s) => normalizeCode(s.statusCode));
  if (codes.some((c) => c.includes("delet"))) return "deleted";
  if (codes.some((c) => c.includes("void"))) return "voided";
  if (codes.some((c) => c.includes("expir"))) return "expired";
  if (codes.some((c) => c.includes("cancel"))) return "cancelled";
  if (codes.some((c) => c === "declined" || c.includes("decline"))) return "declined";
  if (codes.some((c) => c === "error" || c.includes("error"))) return "error";
  if (codes.some((c) => c === "invalid" || c.includes("invalid"))) return "invalid";

  const signedCount = codes.filter((c) => c === "signed").length;
  const outstanding = summary.signatures.filter((s) => {
    const c = normalizeCode(s.statusCode);
    return c !== "signed" && !c.includes("decline");
  });

  if (signedCount > 0 && outstanding.length > 0) return "partially_signed";
  if (signedCount > 0 && outstanding.length === 0) return "signed";

  const raw = normalizeCode(summary.rawStatus);
  if (raw === "complete" || raw === "signed") return summary.isComplete ? "complete" : "signed";
  if (raw === "partially_signed") return "partially_signed";
  if (raw === "viewed") return "viewed";
  if (raw === "pending") return "pending";
  if (raw === "awaiting_signature") return "awaiting_signature";

  if (summary.signatures.some((s) => s.lastViewedAt)) return "viewed";
  if (summary.signatures.length === 0) return "unknown";
  return "awaiting_signature";
}

export function isEligibleDropboxStatus(status: P246DropboxLiveStatus): boolean {
  return P246_ELIGIBLE_DROPBOX_STATUSES.has(status);
}

/** True when the candidate's signer slot is still incomplete. */
export function candidateSignerStillOutstanding(
  summary: DropboxSignRequestSummary,
  candidateEmail: string,
): boolean {
  const email = candidateEmail.trim().toLowerCase();
  const match = summary.signatures.find((s) => s.signerEmail.trim().toLowerCase() === email);
  if (!match) return false;
  const code = normalizeCode(match.statusCode);
  if (code === "signed") return false;
  if (code.includes("decline") || code.includes("cancel") || code.includes("expir") || code.includes("void")) {
    return false;
  }
  return true;
}

export function packetIncludesEmail(
  summary: DropboxSignRequestSummary,
  candidateEmail: string,
): boolean {
  const email = candidateEmail.trim().toLowerCase();
  if (!email) return false;
  return summary.signatures.some((s) => s.signerEmail.trim().toLowerCase() === email);
}

export type P246DropboxProbeResult =
  | {
      ok: true;
      status: P246DropboxLiveStatus;
      summary: DropboxSignRequestSummary;
      source: "dropbox";
    }
  | {
      ok: false;
      status: null;
      summary: null;
      source: "none";
      error: string;
      failure: "dropbox_status_lookup_failed" | "system_configuration_error";
    };

/**
 * Live Dropbox probe — fail closed. Never falls back to workflow status for eligibility.
 * When forceRefresh is true, invalidate cache so pre-send checks see current Dropbox state.
 */
export async function probeDropboxLiveStatus(
  signatureRequestId: string,
  options?: { forceRefresh?: boolean },
): Promise<P246DropboxProbeResult> {
  if (!readDropboxSignConfig()) {
    return {
      ok: false,
      status: null,
      summary: null,
      source: "none",
      error: "DROPBOX_SIGN_API_KEY is not configured",
      failure: "system_configuration_error",
    };
  }

  try {
    if (options?.forceRefresh) {
      invalidateCachedSignatureRequest(signatureRequestId);
    }
    const summary = await getSignatureRequest(signatureRequestId);
    if (!summary.signatureRequestId) {
      return {
        ok: false,
        status: null,
        summary: null,
        source: "none",
        error: "Dropbox returned empty signature request id",
        failure: "dropbox_status_lookup_failed",
      };
    }
    return {
      ok: true,
      status: mapDropboxSummaryToLiveStatus(summary),
      summary,
      source: "dropbox",
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      summary: null,
      source: "none",
      error: error instanceof Error ? error.message : "Dropbox Sign lookup failed",
      failure: "dropbox_status_lookup_failed",
    };
  }
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
