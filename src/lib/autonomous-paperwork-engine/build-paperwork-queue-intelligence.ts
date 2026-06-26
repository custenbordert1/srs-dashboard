import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { hoursSince } from "@/lib/candidate-action-sla";
import {
  buildPaperworkAutoEligibility,
  lifecycleStatusLabel,
  resolvePaperworkLifecycleStatus,
  resolvePaperworkSendSource,
} from "@/lib/autonomous-paperwork-engine/paperwork-lifecycle";
import { resolveQueueElapsed } from "@/lib/autonomous-paperwork-engine/build-today-activity";
import type {
  PaperworkAutomationReadiness,
  PaperworkQueueRow,
  PaperworkQueueTimelineEntry,
  RecruiterPaperworkMetricsRow,
} from "@/lib/autonomous-paperwork-engine/types";
import {
  isTimestampInLastCalendarDays,
  isTimestampOnCalendarDay,
  resolveReferenceDayKeys,
} from "@/lib/executive-natural-language-queries/query-date-windows";

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function buildTimeline(onboarding: CandidateOnboardingRecord | null): PaperworkQueueTimelineEntry[] {
  if (!onboarding) return [];
  return onboarding.statusHistory.map((entry) => ({
    status: entry.status,
    at: entry.at,
    detail: entry.detail ?? null,
  }));
}

function resolveLastActivity(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
}): { label: string; at: string | null } {
  const history = input.onboarding?.statusHistory ?? [];
  const latest = [...history].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (latest) {
    return { label: latest.status.replaceAll("_", " "), at: latest.at };
  }
  const at =
    input.row.paperworkSignedAt ??
    input.row.paperworkViewedAt ??
    input.row.paperworkSentAt ??
    input.onboarding?.sentAt ??
    null;
  if (!at) return { label: "No activity", at: null };
  return { label: input.row.paperworkStatus, at };
}

export function buildPaperworkCandidateQueue(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  referenceMs?: number;
}): PaperworkQueueRow[] {
  const referenceMs = input.referenceMs ?? Date.now();
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const rows: PaperworkQueueRow[] = [];

  for (const row of input.candidates) {
    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const lifecycleStatus = resolvePaperworkLifecycleStatus({ row, onboarding, policy: input.policy });
    const inPipeline =
      lifecycleStatus !== "eligible" ||
      row.actionType === "send-paperwork" ||
      row.actionType === "await-signature" ||
      Boolean(onboarding);
    if (!inPipeline && lifecycleStatus === "eligible") continue;

    const lastActivity = resolveLastActivity({ row, onboarding });
    const elapsed = resolveQueueElapsed(lastActivity.at, referenceMs);
    const sendSource = resolvePaperworkSendSource({ row, onboarding });

    rows.push({
      candidateId: row.candidateId,
      candidateName: candidateName(row),
      email: row.email?.trim() || null,
      owner: row.assignedRecruiter?.trim() || "Unassigned",
      lifecycleStatus,
      lifecycleLabel: lifecycleStatusLabel(lifecycleStatus),
      lastActivity: lastActivity.label,
      lastActivityAt: lastActivity.at,
      elapsedLabel: elapsed.elapsedLabel,
      elapsedHours: elapsed.elapsedHours,
      retryCount: onboarding?.retryCount ?? 0,
      sendSource,
      recommendedAction: row.requiredAction ?? row.nextActionNeeded ?? null,
      timeline: buildTimeline(onboarding),
    });
  }

  return rows.sort((a, b) => (b.elapsedHours ?? 0) - (a.elapsedHours ?? 0));
}

export function buildRecruiterPaperworkMetrics(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  fetchedAt: string;
}): RecruiterPaperworkMetricsRow[] {
  const { todayKey } = resolveReferenceDayKeys(input.fetchedAt);
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );
  const byRecruiter = new Map<string, RecruiterPaperworkMetricsRow>();

  for (const row of input.candidates) {
    const recruiter = row.assignedRecruiter?.trim() || "Unassigned";
    const bucket =
      byRecruiter.get(recruiter) ??
      ({
        recruiter,
        manualSends: 0,
        autoSends: 0,
        signed: 0,
        pending: 0,
        failed: 0,
        averageSignTimeHours: null,
      } as RecruiterPaperworkMetricsRow);

    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const sentAt = row.paperworkSentAt ?? onboarding?.sentAt ?? null;
    if (sentAt && isTimestampOnCalendarDay(sentAt, todayKey)) {
      const source = resolvePaperworkSendSource({ row, onboarding });
      if (source === "auto") bucket.autoSends += 1;
      else bucket.manualSends += 1;
    }

    const lifecycle = resolvePaperworkLifecycleStatus({
      row,
      onboarding,
      policy: input.policy,
    });
    if (lifecycle === "signed") bucket.signed += 1;
    if (lifecycle === "sent" || lifecycle === "viewed") bucket.pending += 1;
    if (lifecycle === "failed") bucket.failed += 1;

    byRecruiter.set(recruiter, bucket);
  }

  const signDurationsByRecruiter = new Map<string, number[]>();
  for (const row of input.candidates) {
    if (!row.paperworkSentAt || !row.paperworkSignedAt) continue;
    const hours = hoursSince(row.paperworkSentAt, Date.parse(row.paperworkSignedAt));
    if (hours == null) continue;
    const recruiter = row.assignedRecruiter?.trim() || "Unassigned";
    const list = signDurationsByRecruiter.get(recruiter) ?? [];
    list.push(hours);
    signDurationsByRecruiter.set(recruiter, list);
  }

  return [...byRecruiter.values()]
    .map((row) => {
      const durations = signDurationsByRecruiter.get(row.recruiter) ?? [];
      return {
        ...row,
        averageSignTimeHours:
          durations.length > 0
            ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
            : null,
      };
    })
    .sort(
      (a, b) =>
        b.manualSends + b.autoSends - (a.manualSends + a.autoSends) ||
        a.recruiter.localeCompare(b.recruiter),
    );
}

export function buildPaperworkAutomationReadiness(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
}): PaperworkAutomationReadiness {
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );
  const reasonCounts = new Map<string, number>();
  let readyForAutoSend = 0;
  let blocked = 0;

  for (const row of input.candidates) {
    const eligibility = buildPaperworkAutoEligibility({
      row,
      onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
      policy: input.policy,
    });
    if (eligibility.eligible) {
      readyForAutoSend += 1;
    } else if (eligibility.missingReasons.length > 0) {
      blocked += 1;
      for (const reason of eligibility.missingReasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }
  }

  return {
    readyForAutoSend,
    blocked,
    blockReasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function buildPaperworkExecutiveMetrics(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  todayActivity: import("@/lib/autonomous-paperwork-engine/types").PaperworkTodayActivityCard;
  fetchedAt: string;
}): import("@/lib/autonomous-paperwork-engine/types").PaperworkExecutiveMetrics {
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  let weeklySendTrend = 0;
  let autoSends = 0;
  let manualSends = 0;
  let failedCount = 0;
  let sentTotal = 0;
  let pendingOver24Hours = 0;
  let pendingOver48Hours = 0;
  let pendingOver72Hours = 0;

  for (const row of input.candidates) {
    const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
    const sentAt = row.paperworkSentAt ?? onboarding?.sentAt ?? null;
    if (sentAt && isTimestampInLastCalendarDays(sentAt, input.fetchedAt, 7)) {
      weeklySendTrend += 1;
    }
    if (sentAt) {
      sentTotal += 1;
      const source = resolvePaperworkSendSource({ row, onboarding });
      if (source === "auto") autoSends += 1;
      else if (source === "manual") manualSends += 1;
    }

    const lifecycle = resolvePaperworkLifecycleStatus({
      row,
      onboarding,
      policy: input.policy,
    });
    if (lifecycle === "failed") failedCount += 1;

    if (lifecycle === "sent" || lifecycle === "viewed") {
      const hours = hoursSince(sentAt, Date.parse(input.fetchedAt));
      if (hours != null) {
        if (hours >= 24) pendingOver24Hours += 1;
        if (hours >= 48) pendingOver48Hours += 1;
        if (hours >= 72) pendingOver72Hours += 1;
      }
    }
  }

  const autoSendPercent = sentTotal > 0 ? Math.round((autoSends / sentTotal) * 100) : null;
  const manualSendPercent = sentTotal > 0 ? Math.round((manualSends / sentTotal) * 100) : null;
  const failureRate = sentTotal > 0 ? Math.round((failedCount / sentTotal) * 1000) / 10 : null;

  return {
    todaysSends: input.todayActivity.paperworkSentToday,
    todaysSignatures: input.todayActivity.signedToday,
    weeklySendTrend,
    averageTimeToSignHours: input.todayActivity.averageTimeToSignHours,
    autoSendPercent,
    manualSendPercent,
    failureRate,
    pendingOver24Hours,
    pendingOver48Hours,
    pendingOver72Hours,
  };
}
