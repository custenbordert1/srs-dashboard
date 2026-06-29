import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkTodayActivity } from "@/lib/autonomous-paperwork-engine/build-today-activity";
import { loadPaperworkSendAuditLog } from "@/lib/autonomous-paperwork-send-engine/audit-log-store";
import type { PaperworkSendDashboardMetrics, P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { isTimestampOnCalendarDay, resolveReferenceDayKeys } from "@/lib/executive-natural-language-queries/query-date-windows";

export async function buildP84DashboardMetrics(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  flags: P84FeatureFlags;
  fetchedAt?: string;
}): Promise<PaperworkSendDashboardMetrics> {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const { todayKey } = resolveReferenceDayKeys(fetchedAt);
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const todayActivity = buildPaperworkTodayActivity({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    referenceMs: Date.parse(fetchedAt),
  });

  let candidatesWaiting = 0;
  let awaitingSignatures = 0;
  let readyForWork = 0;
  let failures = 0;
  let retries = 0;
  const sendDurations: number[] = [];
  const signatureDurations: number[] = [];

  for (const row of input.candidates) {
    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const stage = classifyPaperworkStage({ row, onboarding });

    if (
      row.workflowStatus === "Paperwork Needed" &&
      (row.actionType ?? "none") === "send-paperwork"
    ) {
      candidatesWaiting += 1;
    }

    if (stage === "sent" || stage === "viewed") awaitingSignatures += 1;
    if (row.workflowStatus === "Ready for MEL") readyForWork += 1;
    if (stage === "failed") failures += 1;
    retries += onboarding?.retryCount ?? 0;

    const sentAt = row.paperworkSentAt ?? onboarding?.sentAt ?? null;
    if (sentAt && onboarding?.lastSendAttemptAt) {
      const duration = Date.parse(sentAt) - Date.parse(onboarding.lastSendAttemptAt);
      if (duration > 0 && isTimestampOnCalendarDay(sentAt, todayKey)) {
        sendDurations.push(duration);
      }
    }

    if (row.paperworkSignedAt && sentAt) {
      const duration = Date.parse(row.paperworkSignedAt) - Date.parse(sentAt);
      if (duration > 0 && isTimestampOnCalendarDay(row.paperworkSignedAt, todayKey)) {
        signatureDurations.push(duration);
      }
    }
  }

  const audit = await loadPaperworkSendAuditLog();
  const auditRetries = audit.filter((event) => (event.retryCount ?? 0) > 0).length;
  retries = Math.max(retries, auditRetries);

  return {
    candidatesWaiting,
    paperworkSentToday: todayActivity.paperworkSentToday,
    awaitingSignatures,
    signedToday: todayActivity.signedToday,
    readyForWork,
    failures,
    retries,
    averageSendTimeMs:
      sendDurations.length > 0
        ? Math.round(sendDurations.reduce((sum, value) => sum + value, 0) / sendDurations.length)
        : null,
    averageSignatureCompletionMs:
      signatureDurations.length > 0
        ? Math.round(signatureDurations.reduce((sum, value) => sum + value, 0) / signatureDurations.length)
        : null,
    liveMode: input.flags.liveMode,
    liveSend: input.flags.liveSend,
  };
}
