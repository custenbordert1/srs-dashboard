import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { hoursSince } from "@/lib/candidate-action-sla";

export type PaperworkOperationsMetrics = {
  viewedNotSigned: number;
  avgTimeToSignHours: number | null;
  signedToday: number;
  pendingOver24h: number;
  resendCandidates: number;
};

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function buildPaperworkOperationsMetrics(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): PaperworkOperationsMetrics {
  const ref = new Date(referenceMs);
  let viewedNotSigned = 0;
  let signedToday = 0;
  let pendingOver24h = 0;
  let resendCandidates = 0;
  const signDurationsHours: number[] = [];

  for (const row of candidates) {
    if (row.paperworkStatus === "viewed" && row.workflowStatus === "Paperwork Sent") {
      viewedNotSigned += 1;
    }

    if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
      if (row.paperworkSignedAt) {
        const signedAt = new Date(row.paperworkSignedAt);
        if (!Number.isNaN(signedAt.getTime()) && isSameUtcDay(signedAt, ref)) {
          signedToday += 1;
        }
        if (row.paperworkSentAt) {
          const sentHours = hoursSince(row.paperworkSentAt, Date.parse(row.paperworkSignedAt));
          if (sentHours != null) signDurationsHours.push(sentHours);
        }
      }
      continue;
    }

    const pending =
      row.signatureRequestId &&
      (row.paperworkStatus === "sent" || row.paperworkStatus === "viewed") &&
      row.workflowStatus === "Paperwork Sent";
    if (!pending) continue;

    const sentHours = hoursSince(row.paperworkSentAt, referenceMs);
    if (sentHours != null && sentHours >= 24) {
      pendingOver24h += 1;
      resendCandidates += 1;
    }
  }

  const avgTimeToSignHours =
    signDurationsHours.length > 0
      ? Math.round(
          (signDurationsHours.reduce((sum, h) => sum + h, 0) / signDurationsHours.length) * 10,
        ) / 10
      : null;

  return {
    viewedNotSigned,
    avgTimeToSignHours,
    signedToday,
    pendingOver24h,
    resendCandidates,
  };
}
