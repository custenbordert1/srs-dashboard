import type { DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";

export function mapSignatureRequestToPaperworkStatus(
  request: DropboxSignRequestSummary,
): PaperworkStatus {
  if (request.isComplete) return "signed";
  if (request.isDeclined) return "declined";
  if (request.signatures.some((s) => s.statusCode === "declined")) return "declined";
  if (request.signatures.some((s) => s.lastViewedAt)) return "viewed";
  return "sent";
}

export function paperworkStatusLabel(status: PaperworkStatus): string {
  const labels: Record<PaperworkStatus, string> = {
    not_sent: "Not sent",
    sent: "Sent",
    viewed: "Viewed",
    signed: "Signed",
    declined: "Declined",
    failed: "Failed",
  };
  return labels[status];
}
