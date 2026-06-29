import type {
  OnboardingPipelineExecutiveSummary,
  OnboardingPipelineRecord,
} from "@/lib/onboarding-pipeline-engine/types";

export function buildOnboardingPipelineExecutiveSummary(
  records: OnboardingPipelineRecord[],
): OnboardingPipelineExecutiveSummary {
  if (records.length === 0) {
    return {
      totalRecords: 0,
      readyForWorkCount: 0,
      stalledCount: 0,
      averageProgressPercent: 0,
    };
  }

  const readyForWorkCount = records.filter((row) => row.stage === "ready_for_work").length;
  const stalledCount = records.filter((row) => row.stalled).length;
  const averageProgressPercent = Math.round(
    records.reduce((sum, row) => sum + row.progressPercent, 0) / records.length,
  );

  return {
    totalRecords: records.length,
    readyForWorkCount,
    stalledCount,
    averageProgressPercent,
  };
}
