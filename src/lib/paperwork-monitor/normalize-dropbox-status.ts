import type { DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import type { DropboxMonitorStatus } from "@/lib/paperwork-monitor/types";

export function normalizeDropboxMonitorStatus(
  request: DropboxSignRequestSummary,
): DropboxMonitorStatus {
  if (request.isComplete) return "signed";
  if (request.isDeclined) return "declined";

  const codes = request.signatures.map((s) => s.statusCode.toLowerCase());
  if (codes.some((c) => c.includes("expired"))) return "expired";
  if (codes.some((c) => c.includes("cancel"))) return "canceled";
  if (codes.some((c) => c === "declined")) return "declined";
  if (codes.some((c) => c === "signed")) return "signed";
  if (request.signatures.some((s) => s.lastViewedAt)) return "viewed";
  return "awaiting_signature";
}

export function dropboxStatusLabel(status: DropboxMonitorStatus): string {
  const labels: Record<DropboxMonitorStatus, string> = {
    awaiting_signature: "Awaiting Signature",
    viewed: "Viewed",
    signed: "Signed",
    declined: "Declined",
    expired: "Expired",
    canceled: "Canceled",
  };
  return labels[status];
}
