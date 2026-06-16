import type { PredictiveRiskTrend } from "@/lib/predictive-territory-risk/types";
import type {
  CoverageForecastPoint,
  CoverageForecastRow,
  HiringForecastHorizon,
} from "@/lib/workforce-capacity-forecast/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const HORIZON_DAYS: Record<HiringForecastHorizon, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function trendFromDelta(delta: number): PredictiveRiskTrend {
  if (delta > 2) return "improving";
  if (delta < -2) return "declining";
  return "stable";
}

function buildForecastPoints(input: {
  baseCoverage: number;
  baseOpenCalls: number;
  baseRisk: number;
  baseTrend: PredictiveRiskTrend;
}): CoverageForecastPoint[] {
  return (Object.keys(HORIZON_DAYS) as HiringForecastHorizon[]).map((horizon) => {
    const days = HORIZON_DAYS[horizon];
    const improvementFactor = days / 30;
    const riskReduction = Math.round(input.baseRisk * 0.12 * improvementFactor);
    const coverageGain = Math.round((100 - input.baseCoverage) * 0.1 * improvementFactor);
    const coveragePercent = clamp(input.baseCoverage + coverageGain, 0, 100);
    const openCallReduction = Math.round(input.baseOpenCalls * 0.07 * improvementFactor);
    const completionPercent = clamp(
      Math.round((100 - input.baseRisk * 0.6) + coverageGain * 0.45),
      0,
      100,
    );
    const trend =
      input.baseTrend === "declining"
        ? trendFromDelta(-riskReduction)
        : input.baseTrend === "improving"
          ? trendFromDelta(riskReduction)
          : trendFromDelta(coverageGain - riskReduction);

    return {
      horizon,
      coveragePercent,
      openCallReduction,
      completionPercent,
      riskTrend: trend,
    };
  });
}

export function buildCoverageForecastRows(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
}): CoverageForecastRow[] {
  const rows: CoverageForecastRow[] = [];
  const companyCoverage = Math.round(input.bundle.coverage.executiveSummary.averageCoverageScore);
  const companyOpenCalls = input.bundle.opportunities.filter(
    (opp) => opp.openStatus && !opp.isStaffed,
  ).length;
  const companyRisk =
    input.riskSnapshot.territories.length > 0
      ? Math.round(
          input.riskSnapshot.territories.reduce((sum, row) => sum + row.riskScore, 0) /
            input.riskSnapshot.territories.length,
        )
      : 50;

  rows.push({
    entityId: "company",
    scope: "company",
    label: "Company-wide",
    currentCoveragePercent: companyCoverage,
    currentOpenCalls: companyOpenCalls,
    forecasts: buildForecastPoints({
      baseCoverage: companyCoverage,
      baseOpenCalls: companyOpenCalls,
      baseRisk: companyRisk,
      baseTrend: "stable",
    }),
  });

  for (const territory of input.riskSnapshot.territories.filter(
    (row) => row.entityType === "dm" || row.entityType === "territory",
  ).slice(0, 12)) {
    rows.push({
      entityId: territory.entityId,
      scope: territory.entityType === "dm" ? "dm" : "territory",
      label: territory.label,
      dmName: territory.dmName,
      currentCoveragePercent: territory.coveragePercent,
      currentOpenCalls: territory.openCalls,
      forecasts: buildForecastPoints({
        baseCoverage: territory.coveragePercent,
        baseOpenCalls: territory.openCalls,
        baseRisk: territory.riskScore,
        baseTrend: territory.trend,
      }),
    });
  }

  const projectMap = new Map<string, { openCalls: number; coverage: number; risk: number; dm: string }>();
  for (const opp of input.bundle.opportunities) {
    if (!opp.openStatus || opp.isStaffed) continue;
    const key = opp.projectName || opp.opportunityId;
    const coverageRow = input.bundle.coverage.opportunities.find(
      (row) => row.opportunityId === opp.opportunityId,
    );
    const existing = projectMap.get(key) ?? {
      openCalls: 0,
      coverage: coverageRow?.coverageScore ?? 50,
      risk: 50,
      dm: opp.territoryOwner ?? "Unassigned",
    };
    existing.openCalls += 1;
    if (coverageRow) existing.coverage = Math.round((existing.coverage + coverageRow.coverageScore) / 2);
    projectMap.set(key, existing);
  }

  for (const project of input.riskSnapshot.projects.slice(0, 10)) {
    const mapped = projectMap.get(project.label);
    rows.push({
      entityId: project.entityId,
      scope: "project",
      label: project.label,
      dmName: project.dmName,
      currentCoveragePercent: mapped?.coverage ?? project.coveragePercent,
      currentOpenCalls: mapped?.openCalls ?? project.openCalls,
      forecasts: buildForecastPoints({
        baseCoverage: mapped?.coverage ?? project.coveragePercent,
        baseOpenCalls: mapped?.openCalls ?? project.openCalls,
        baseRisk: project.riskScore,
        baseTrend: project.trend,
      }),
    });
  }

  return rows;
}

export function filterCoverageForecastsByStates(
  rows: CoverageForecastRow[],
  states: string[],
): CoverageForecastRow[] {
  if (states.length === 0) return rows;
  const allowed = new Set(states.map(normalizeStateCode));
  return rows.filter((row) => {
    if (row.scope === "company") return true;
    const stateCodes = row.label
      .split(/[,\s]+/)
      .map(normalizeStateCode)
      .filter((code) => code.length === 2);
    if (stateCodes.length === 0) return true;
    return stateCodes.some((code) => allowed.has(code));
  });
}
