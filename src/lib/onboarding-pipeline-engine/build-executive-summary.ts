import { daysBetween, isDueWithinDays, isOverdue } from "@/lib/onboarding-pipeline-engine/due-date-engine";
import { pipelineStageLabel } from "@/lib/onboarding-pipeline-engine/stages";
import type {
  OnboardingPipelineExecutiveSummary,
  OnboardingPipelineRecord,
  OnboardingPipelineStage,
} from "@/lib/onboarding-pipeline-engine/types";

function emptyExecutiveSummary(): OnboardingPipelineExecutiveSummary {
  return {
    totalRecords: 0,
    readyForWorkCount: 0,
    stalledCount: 0,
    averageProgressPercent: 0,
    averageOnboardingDays: null,
    readyThisWeekCount: 0,
    overdueOnboardingCount: 0,
    estimatedReadyForWorkThisWeek: 0,
    bottleneckStage: null,
    bottleneckStageLabel: null,
    longestWaiting: null,
  };
}

export function buildOnboardingPipelineExecutiveSummary(
  records: OnboardingPipelineRecord[],
  referenceAt?: string,
): OnboardingPipelineExecutiveSummary {
  if (records.length === 0) {
    return emptyExecutiveSummary();
  }

  const ref = referenceAt ?? new Date().toISOString();
  const readyForWorkCount = records.filter((row) => row.stage === "ready_for_work").length;
  const stalledCount = records.filter((row) => row.stalled).length;
  const averageProgressPercent = Math.round(
    records.reduce((sum, row) => sum + row.progressPercent, 0) / records.length,
  );

  const onboardingDays = records
    .filter((row) => row.paperworkSignedAt)
    .map((row) => daysBetween(row.paperworkSignedAt!, ref));
  const averageOnboardingDays =
    onboardingDays.length > 0
      ? Math.round(onboardingDays.reduce((sum, days) => sum + days, 0) / onboardingDays.length)
      : null;

  const readyThisWeekCount = records.filter(
    (row) =>
      row.stage === "ready_for_work" ||
      isDueWithinDays(row.estimatedCompletionAt, ref, 7),
  ).length;

  const overdueOnboardingCount = records.filter((row) =>
    isOverdue(row.dueDates.currentStageDueAt, ref),
  ).length;

  const estimatedReadyForWorkThisWeek = records.filter((row) =>
    isDueWithinDays(row.estimatedCompletionAt, ref, 7),
  ).length;

  const stageCounts = new Map<OnboardingPipelineStage, number>();
  for (const record of records) {
    if (record.stage === "ready_for_work") continue;
    stageCounts.set(record.stage, (stageCounts.get(record.stage) ?? 0) + 1);
  }
  let bottleneckStage: OnboardingPipelineStage | null = null;
  let bottleneckCount = 0;
  for (const [stage, count] of stageCounts.entries()) {
    if (count > bottleneckCount) {
      bottleneckStage = stage;
      bottleneckCount = count;
    }
  }

  const longest = records.reduce<OnboardingPipelineRecord | null>((best, row) => {
    if (!best || row.waitingDays > best.waitingDays) return row;
    return best;
  }, null);

  return {
    totalRecords: records.length,
    readyForWorkCount,
    stalledCount,
    averageProgressPercent,
    averageOnboardingDays,
    readyThisWeekCount,
    overdueOnboardingCount,
    estimatedReadyForWorkThisWeek,
    bottleneckStage,
    bottleneckStageLabel: bottleneckStage ? pipelineStageLabel(bottleneckStage) : null,
    longestWaiting: longest
      ? { candidateName: longest.candidateName, days: longest.waitingDays }
      : null,
  };
}
