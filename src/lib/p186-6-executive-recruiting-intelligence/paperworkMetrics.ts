import type { P1866CohortCandidate } from "@/lib/p186-6-executive-recruiting-intelligence/types";
import { median } from "@/lib/p186-6-executive-recruiting-intelligence/util";

export type PaperworkOnboardingMetrics = {
  paperworkSentToday: number;
  awaitingSignature: number;
  viewed: number;
  signed: number;
  declined: number;
  canceled: number;
  expired: number;
  failed: number;
  medianTimeToViewMs: number | null;
  medianTimeToSignMs: number | null;
  signaturesOlderThanThreshold: number;
  missingDocumentCases: number;
  onboardingCompletionRate: number | null;
  readyForMelBacklog: number;
  melExportReviewBacklog: number;
};

/**
 * Read-only paperwork/onboarding metrics from observed cohort fields
 * (sourced conceptually from P184/P185 + Dropbox — no send calls).
 */
export function buildPaperworkOnboardingMetrics(input: {
  cohort: P1866CohortCandidate[];
  signatureAgeThresholdMs?: number;
  nowMs?: number;
}): PaperworkOnboardingMetrics {
  const now = input.nowMs ?? Date.now();
  const threshold = input.signatureAgeThresholdMs ?? 5 * 86400000;
  const rows = input.cohort;

  const status = (s: string) =>
    rows.filter((r) => (r.paperworkStatus ?? "").toLowerCase() === s).length;

  const viewDeltas = rows
    .filter((r) => r.paperworkSentAt && r.viewedAt)
    .map((r) => Date.parse(r.viewedAt!) - Date.parse(r.paperworkSentAt!))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const signDeltas = rows
    .filter((r) => r.paperworkSentAt && r.signedAt)
    .map((r) => Date.parse(r.signedAt!) - Date.parse(r.paperworkSentAt!))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const signedStages = rows.filter((r) =>
    ["PAPERWORK_SIGNED", "ONBOARDING_COMPLETE", "READY_FOR_MEL", "MEL_EXPORT_REVIEW", "EXPORTED"].includes(
      r.funnelStage,
    ),
  ).length;
  const onboardingDone = rows.filter((r) =>
    ["ONBOARDING_COMPLETE", "READY_FOR_MEL", "MEL_EXPORT_REVIEW", "EXPORTED"].includes(r.funnelStage),
  ).length;

  return {
    paperworkSentToday: rows.filter(
      (r) => r.paperworkSentAt && Date.parse(r.paperworkSentAt) >= now - 86400000,
    ).length,
    awaitingSignature: rows.filter((r) =>
      ["PAPERWORK_SENT", "PAPERWORK_VIEWED"].includes(r.funnelStage),
    ).length,
    viewed: status("viewed") + rows.filter((r) => r.funnelStage === "PAPERWORK_VIEWED").length,
    signed: status("signed") + rows.filter((r) => r.funnelStage === "PAPERWORK_SIGNED").length,
    declined: status("declined"),
    canceled: status("canceled"),
    expired: status("expired"),
    failed: status("failed"),
    medianTimeToViewMs: median(viewDeltas),
    medianTimeToSignMs: median(signDeltas),
    signaturesOlderThanThreshold: rows.filter((r) => {
      if (!["PAPERWORK_SENT", "PAPERWORK_VIEWED"].includes(r.funnelStage)) return false;
      return now - Date.parse(r.stageEnteredAt) > threshold;
    }).length,
    missingDocumentCases: rows.filter((r) => r.missingDocuments).length,
    onboardingCompletionRate:
      signedStages > 0 ? Math.round((onboardingDone / signedStages) * 1000) / 10 : null,
    readyForMelBacklog: rows.filter((r) => r.funnelStage === "READY_FOR_MEL").length,
    melExportReviewBacklog: rows.filter((r) => r.funnelStage === "MEL_EXPORT_REVIEW").length,
  };
}
