import type {
  OnboardingExecutiveProgressMetrics,
  OnboardingWorkspaceCandidateSnapshot,
} from "@/lib/autonomous-onboarding-engine/types";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function isToday(iso: string, referenceMs: number): boolean {
  const date = new Date(iso);
  const ref = new Date(referenceMs);
  return (
    date.getUTCFullYear() === ref.getUTCFullYear() &&
    date.getUTCMonth() === ref.getUTCMonth() &&
    date.getUTCDate() === ref.getUTCDate()
  );
}

function averageStepGapHours(candidate: OnboardingWorkspaceCandidateSnapshot): number | null {
  const completed = candidate.activityTimeline
    .filter((row) => row.status === "completed" && row.at)
    .sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));

  if (completed.length < 2) return null;

  let totalGapMs = 0;
  for (let i = 1; i < completed.length; i += 1) {
    totalGapMs += Date.parse(completed[i]!.at!) - Date.parse(completed[i - 1]!.at!);
  }
  return totalGapMs / (completed.length - 1) / MS_PER_HOUR;
}

export function buildOnboardingExecutiveProgressMetrics(input: {
  candidates: OnboardingWorkspaceCandidateSnapshot[];
  referenceMs?: number;
}): OnboardingExecutiveProgressMetrics {
  const referenceMs = input.referenceMs ?? Date.now();
  const candidates = input.candidates;
  const totalOnboarding = candidates.length;

  if (totalOnboarding === 0) {
    return {
      totalOnboarding: 0,
      averageProgressPct: 0,
      averageTimeBetweenStepsHours: null,
      candidatesWaiting: 0,
      candidatesBlocked: 0,
      readyForWorkToday: 0,
      averageDaysToReady: null,
    };
  }

  const averageProgressPct = Math.round(
    candidates.reduce((sum, row) => sum + row.progress.progressPercent, 0) / totalOnboarding,
  );

  const stepGaps = candidates
    .map(averageStepGapHours)
    .filter((value): value is number => value != null);
  const averageTimeBetweenStepsHours =
    stepGaps.length > 0
      ? Math.round((stepGaps.reduce((sum, value) => sum + value, 0) / stepGaps.length) * 10) / 10
      : null;

  const candidatesWaiting = candidates.filter(
    (row) =>
      row.remainingSteps.length > 0 &&
      row.stall.level !== "blocked" &&
      row.currentState !== "assigned",
  ).length;

  const candidatesBlocked = candidates.filter((row) => row.stall.level === "blocked").length;

  const readyForWorkToday = candidates.filter(
    (row) =>
      row.readiness.status === "ready_for_work" &&
      row.readiness.readyAt &&
      isToday(row.readiness.readyAt, referenceMs),
  ).length;

  const readyDurationsDays = candidates
    .filter((row) => row.readiness.status === "ready_for_work" && row.readiness.readyAt)
    .map((row) => {
      const applied = Date.parse(
        row.activityTimeline.find((entry) => entry.id === "activity-paperwork-sent")?.at ??
          row.lastActivity?.completedAt ??
          row.readiness.readyAt!,
      );
      const ready = Date.parse(row.readiness.readyAt!);
      if (!Number.isFinite(applied) || !Number.isFinite(ready)) return null;
      return Math.max(0, (ready - applied) / MS_PER_DAY);
    })
    .filter((value): value is number => value != null);

  const averageDaysToReady =
    readyDurationsDays.length > 0
      ? Math.round((readyDurationsDays.reduce((sum, value) => sum + value, 0) / readyDurationsDays.length) * 10) / 10
      : null;

  return {
    totalOnboarding,
    averageProgressPct,
    averageTimeBetweenStepsHours,
    candidatesWaiting,
    candidatesBlocked,
    readyForWorkToday,
    averageDaysToReady,
  };
}
