import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildPaperworkTodayActivity } from "@/lib/autonomous-paperwork-engine/build-today-activity";
import { resolvePaperworkSendSource } from "@/lib/autonomous-paperwork-engine/paperwork-lifecycle";
import type { PaperworkExecutionExecutiveMetrics, PaperworkExecutionQueueItem } from "@/lib/autonomous-paperwork-execution-engine/types";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { isTimestampInLastCalendarDays, isTimestampOnCalendarDay, resolveReferenceDayKeys } from "@/lib/executive-natural-language-queries/query-date-windows";

const ESTIMATED_MANUAL_SEND_MINUTES = 12;

export function buildPaperworkExecutionExecutiveMetrics(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  executionQueue: PaperworkExecutionQueueItem[];
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  fetchedAt: string;
}): PaperworkExecutionExecutiveMetrics {
  const referenceMs = Date.parse(input.fetchedAt);
  const { todayKey } = resolveReferenceDayKeys(input.fetchedAt);
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const todayActivity = buildPaperworkTodayActivity({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    referenceMs,
  });

  let failedToday = 0;
  let retryCount = 0;
  let autoSendsToday = 0;
  let sendDurations: number[] = [];
  let oldestWaiting: string | null = null;

  for (const row of input.candidates) {
    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const stage = classifyPaperworkStage({ row, onboarding });
    const sentAt = row.paperworkSentAt ?? onboarding?.sentAt ?? null;

    if (sentAt && isTimestampOnCalendarDay(sentAt, todayKey)) {
      if (resolvePaperworkSendSource({ row, onboarding }) === "auto") autoSendsToday += 1;
      if (row.paperworkSignedAt) {
        const duration = Date.parse(row.paperworkSignedAt) - Date.parse(sentAt);
        if (duration > 0) sendDurations.push(duration);
      }
    }

    if (stage === "failed" && sentAt && isTimestampOnCalendarDay(sentAt, todayKey)) {
      failedToday += 1;
    }

    retryCount += onboarding?.retryCount ?? 0;

    if ((stage === "sent" || stage === "viewed") && sentAt) {
      if (!oldestWaiting || Date.parse(sentAt) < Date.parse(oldestWaiting)) {
        oldestWaiting = sentAt;
      }
    }
  }

  const queueDepth =
    (input.sendQueueMetrics?.queued ?? 0) +
    (input.sendQueueMetrics?.sending ?? 0) +
    (input.sendQueueMetrics?.retryScheduled ?? 0) +
    input.executionQueue.filter((row) => row.status === "queued" || row.status === "sending").length;

  const totalSendsToday = todayActivity.paperworkSentToday;
  const automationSuccessPercent =
    totalSendsToday > 0
      ? Math.round((autoSendsToday / totalSendsToday) * 1000) / 10
      : null;

  const weeklySent = input.candidates.filter((row) => {
    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const sentAt = row.paperworkSentAt ?? onboarding?.sentAt ?? null;
    return sentAt && isTimestampInLastCalendarDays(sentAt, input.fetchedAt, 7);
  }).length;

  const failureRate =
    totalSendsToday > 0 ? Math.round((failedToday / totalSendsToday) * 1000) / 10 : null;
  const retryRate =
    totalSendsToday > 0 ? Math.round((retryCount / Math.max(totalSendsToday, 1)) * 1000) / 10 : null;

  return {
    autoSendsToday: todayActivity.autoSentToday,
    manualSendsToday: todayActivity.manualSentToday,
    waitingSignature: todayActivity.pendingSignature,
    completedToday: todayActivity.signedToday,
    failedToday,
    averageSendTimeMs:
      sendDurations.length > 0
        ? Math.round(sendDurations.reduce((sum, value) => sum + value, 0) / sendDurations.length)
        : null,
    automationSuccessPercent,
    retryCount,
    queueDepth,
    oldestWaitingPacketAt: oldestWaiting,
    recruiterTimeSavedMinutes: autoSendsToday > 0 ? autoSendsToday * ESTIMATED_MANUAL_SEND_MINUTES : null,
    packetsSentThisWeek: weeklySent,
    failureRate,
    retryRate,
    autoVsManualAutoPercent: todayActivity.paperworkSentToday
      ? Math.round((todayActivity.autoSentToday / todayActivity.paperworkSentToday) * 100)
      : null,
    queueWaitTimeMs: input.sendQueueMetrics?.estimatedCompletionMs ?? null,
  };
}
