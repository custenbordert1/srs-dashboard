import type {
  DmCapacityRow,
  ExecutivePlanningOutlook,
  HiringForecastPoint,
  RecruiterCapacityRow,
  ResourceBalancingRecommendation,
  StaffingRiskArea,
} from "@/lib/workforce-capacity-forecast/types";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildExecutivePlanningOutlook(input: {
  hiringForecast: HiringForecastPoint[];
  recruiterCapacity: RecruiterCapacityRow[];
  dmCapacity: DmCapacityRow[];
  staffingRisks: StaffingRiskArea[];
  resourceBalancing: ResourceBalancingRecommendation[];
}): ExecutivePlanningOutlook {
  const overloadedRecruiters = input.recruiterCapacity.filter(
    (row) => row.state === "overloaded" || row.state === "busy",
  ).length;
  const underutilizedRecruiters = input.recruiterCapacity.filter(
    (row) => row.state === "underutilized",
  ).length;
  const dmsAtRisk = input.dmCapacity.filter((row) => row.atRisk).length;
  const thirtyDayHires =
    input.hiringForecast.find((row) => row.horizon === "30d")?.expectedHires ?? 0;

  const headline =
    overloadedRecruiters > 0
      ? `Next 30 days: ${thirtyDayHires} projected hires with ${overloadedRecruiters} recruiters near capacity`
      : `Next 30 days: ${thirtyDayHires} projected hires with healthy recruiter bench`;

  return {
    headline,
    hiringForecast: input.hiringForecast,
    capacitySummary: {
      overloadedRecruiters,
      underutilizedRecruiters,
      dmsAtRisk,
      averageRecruiterCapacity: average(
        input.recruiterCapacity.map((row) => row.capacityPercent),
      ),
      averageDmCapacityScore: average(input.dmCapacity.map((row) => row.capacityScore)),
    },
    topRisks: input.staffingRisks.slice(0, 8),
    recommendedActions: input.resourceBalancing.slice(0, 5),
  };
}
