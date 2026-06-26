import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { hoursSince } from "@/lib/candidate-action-sla";
import {
  isTimestampInLastCalendarDays,
  isTimestampOnCalendarDay,
  resolveReferenceDayKeys,
} from "@/lib/executive-natural-language-queries/query-date-windows";
import { formatElapsedSince } from "@/lib/autonomous-onboarding-engine/build-onboarding-activity-intelligence";
import type { PaperworkTodayActivityCard } from "@/lib/autonomous-paperwork-engine/types";
import { resolvePaperworkSendSource } from "@/lib/autonomous-paperwork-engine/paperwork-lifecycle";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";

function sentAt(
  row: ScoredCandidateWorkflowRow,
  onboardingByCandidate: Map<string, CandidateOnboardingRecord>,
): string | null {
  return row.paperworkSentAt ?? onboardingByCandidate.get(row.candidateId)?.sentAt ?? null;
}

export function buildPaperworkTodayActivity(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  referenceMs?: number;
}): PaperworkTodayActivityCard {
  const referenceMs = input.referenceMs ?? Date.now();
  const fetchedAt = new Date(referenceMs).toISOString();
  const { todayKey } = resolveReferenceDayKeys(fetchedAt);
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  let paperworkSentToday = 0;
  let autoSentToday = 0;
  let manualSentToday = 0;
  let signedToday = 0;
  let pendingSignature = 0;
  let expired = 0;
  let failed = 0;
  let lastPacketSentAt: string | null = null;
  const signDurations: number[] = [];

  for (const row of input.candidates) {
    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const stage = classifyPaperworkStage({ row, onboarding });
    const sentTimestamp = sentAt(row, onboardingByCandidate);

    if (sentTimestamp && isTimestampOnCalendarDay(sentTimestamp, todayKey)) {
      paperworkSentToday += 1;
      const source = resolvePaperworkSendSource({ row, onboarding });
      if (source === "auto") autoSentToday += 1;
      else if (source === "manual") manualSentToday += 1;
      if (!lastPacketSentAt || Date.parse(sentTimestamp) > Date.parse(lastPacketSentAt)) {
        lastPacketSentAt = sentTimestamp;
      }
    }

    if (
      row.paperworkSignedAt &&
      isTimestampOnCalendarDay(row.paperworkSignedAt, todayKey)
    ) {
      signedToday += 1;
    }

    if (stage === "sent" || stage === "viewed") pendingSignature += 1;
    if (stage === "expired") expired += 1;
    if (stage === "failed") failed += 1;

    if (row.paperworkSignedAt && row.paperworkSentAt) {
      const hours = hoursSince(row.paperworkSentAt, Date.parse(row.paperworkSignedAt));
      if (hours != null && isTimestampInLastCalendarDays(row.paperworkSignedAt, fetchedAt, 7)) {
        signDurations.push(hours);
      }
    }
  }

  const averageTimeToSignHours =
    signDurations.length > 0
      ? Math.round((signDurations.reduce((sum, value) => sum + value, 0) / signDurations.length) * 10) / 10
      : null;

  return {
    paperworkSentToday,
    autoSentToday,
    manualSentToday,
    signedToday,
    pendingSignature,
    expired,
    failed,
    averageTimeToSignHours,
    lastPacketSentAt,
  };
}

export function formatElapsedHoursLabel(hours: number | null): string | null {
  if (hours == null) return null;
  if (hours < 1) return `${Math.round(hours * 60)} minutes ago`;
  if (hours < 24) return `${Math.round(hours * 10) / 10} hours ago`;
  return `${Math.round((hours / 24) * 10) / 10} days ago`;
}

export function resolveQueueElapsed(
  lastActivityAt: string | null,
  referenceMs: number,
): { elapsedHours: number | null; elapsedLabel: string | null } {
  if (!lastActivityAt) return { elapsedHours: null, elapsedLabel: null };
  const elapsedHours = hoursSince(lastActivityAt, referenceMs);
  return {
    elapsedHours,
    elapsedLabel: formatElapsedSince(lastActivityAt, referenceMs),
  };
}
