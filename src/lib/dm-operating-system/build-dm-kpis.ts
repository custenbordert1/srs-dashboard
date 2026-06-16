import type { DmOperatingSystemKpis, DmOperatingSystemScope } from "@/lib/dm-operating-system/types";
import { filterRiskRowsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildRecruiterProductivityLive } from "@/lib/recruiting-automation/recruiter-productivity-live";
import { countHiresLast7Days } from "@/lib/territory-intelligence/territory-intelligence-metrics";
import { countOpenCalls } from "@/lib/unified-recruiting-command-center/build-kpis";
import { normalizeStateCode } from "@/lib/dm-territory-map";

export function buildDmOperatingSystemKpis(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  scope: DmOperatingSystemScope;
}): DmOperatingSystemKpis {
  const { bundle, riskSnapshot, scope } = input;
  const scopedTerritories = filterRiskRowsForDmScope(
    riskSnapshot.territories.filter((row) => row.entityType === "dm"),
    scope,
  );
  const scopedStores = filterRiskRowsForDmScope(riskSnapshot.storeClusters, scope);
  const scopedProjects = filterRiskRowsForDmScope(riskSnapshot.projects, scope);

  const territoryRow =
    scopedTerritories.find(
      (row) => row.dmName.toLowerCase() === scope.dmName.toLowerCase(),
    ) ?? scopedTerritories[0];

  const zeroPipelineStores = riskSnapshot.forecasts.filter(
    (forecast) =>
      forecast.kind === "zero-pipeline-store" &&
      (!scope.scopedToTerritory ||
        forecast.dmName.toLowerCase() === scope.dmName.toLowerCase() ||
        forecast.label.includes(scope.dmName)),
  ).length;

  const storesAtRisk =
    scopedStores.filter((row) => row.riskLevel === "critical" || row.riskLevel === "high").length +
    scopedProjects.filter((row) => row.riskLevel === "critical" || row.riskLevel === "high").length;

  const recruiterRows = buildRecruiterProductivityLive(
    bundle.candidates,
    bundle.workflows,
    bundle.fetchedAt,
  );
  const recruiterActivity = recruiterRows.filter((row) => row.candidatesReviewed > 0).length;

  const territoryCoveragePercent = scope.scopedToTerritory
    ? Math.round(
        scopedTerritories.length > 0
          ? scopedTerritories.reduce((sum, row) => sum + row.coveragePercent, 0) /
              scopedTerritories.length
          : bundle.coverage.executiveSummary.averageCoverageScore,
      )
    : Math.round(bundle.coverage.executiveSummary.averageCoverageScore);

  const openCalls = scope.scopedToTerritory
    ? bundle.opportunities.filter(
        (row) =>
          row.openStatus &&
          !row.isStaffed &&
          scope.territoryStates.includes(normalizeStateCode(row.state)),
      ).length
    : countOpenCalls(bundle);

  return {
    territoryCoveragePercent,
    openCalls,
    storesAtRisk,
    zeroPipelineStores,
    recruiterActivity,
    hiringVelocity: countHiresLast7Days(bundle.candidates, bundle.fetchedAt),
    territoryRiskScore: territoryRow?.riskScore ?? 0,
  };
}
