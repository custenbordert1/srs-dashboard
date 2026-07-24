import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace";
import type { CandidateOpsPaperworkPanel } from "@/lib/p259-candidate-operations/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function estimateExpiration(sentAt: string | null): string | null {
  if (!sentAt) return null;
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return null;
  // Dropbox Sign default signature request window is commonly ~14 days.
  return new Date(date.getTime() + 14 * DAY_MS).toISOString();
}

/**
 * Paperwork operations panel model.
 * Send Paperwork is live-wired via P260 (one at a time). Reminder/resend remain P261.
 */
export function buildPaperworkPanel(row: HiringWorkspaceApplicantRow): CandidateOpsPaperworkPanel {
  const viewed = row.paperworkStatus === "viewed" || Boolean(row.paperworkViewedAt);
  const signed = row.paperworkStatus === "signed" || Boolean(row.paperworkSignedAt);
  const hasEnvelope = Boolean(row.signatureRequestId);
  const activePacket =
    hasEnvelope &&
    (row.paperworkStatus === "sent" ||
      row.paperworkStatus === "viewed" ||
      row.workflowStatus === "Paperwork Sent");
  const reminderCount = row.history.filter(
    (event) =>
      /remind/i.test(event.message || "") ||
      /remind/i.test(event.type),
  ).length;

  return {
    candidateId: row.candidateId,
    dropboxStatus: row.dropboxSignStatus,
    template: row.paperworkTemplateKey || "—",
    envelopeId: row.signatureRequestId,
    viewed,
    viewedAt: row.paperworkViewedAt,
    signed,
    signedAt: row.paperworkSignedAt,
    reminderCount,
    sentDate: row.paperworkSentAt,
    expiration: estimateExpiration(row.paperworkSentAt),
    error: row.paperworkError,
    actions: [
      {
        id: "preview_email",
        label: "Preview Email",
        requiresConfirm: true,
        liveWired: false,
        disabled: false,
      },
      {
        id: "send_paperwork",
        label: "Send Paperwork",
        requiresConfirm: true,
        liveWired: true,
        disabled: signed || activePacket,
        disabledReason: signed
          ? "Already signed"
          : activePacket
            ? "Active/viewed packet on file — no eligibility bypass"
            : undefined,
      },
      {
        id: "send_reminder",
        label: "Send Reminder",
        requiresConfirm: true,
        liveWired: false,
        disabled: !hasEnvelope && row.paperworkStatus === "not_sent",
        disabledReason:
          !hasEnvelope && row.paperworkStatus === "not_sent"
            ? "No sent envelope to remind"
            : undefined,
      },
      {
        id: "resend",
        label: "Resend",
        requiresConfirm: true,
        liveWired: false,
        disabled: signed,
        disabledReason: signed ? "Already signed" : undefined,
      },
      {
        id: "view_envelope",
        label: "View Envelope",
        requiresConfirm: false,
        liveWired: false,
        disabled: !hasEnvelope,
        disabledReason: hasEnvelope ? undefined : "No signature request ID",
      },
      {
        id: "download_audit",
        label: "Download Audit",
        requiresConfirm: true,
        liveWired: false,
        disabled: !hasEnvelope,
        disabledReason: hasEnvelope ? undefined : "No envelope audit available",
      },
    ],
  };
}
