import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildProjectForecastRows } from "@/lib/executive-operations-center/build-project-forecast";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ProjectFillForecastRow, ProjectFillOutcome } from "@/lib/placement-command-center/types";

function mapOutcome(outcome: "likely-to-finish" | "at-risk" | "likely-to-miss"): ProjectFillOutcome {
  if (outcome === "likely-to-finish") return "likely-to-fill";
  if (outcome === "likely-to-miss") return "critical";
  return "at-risk";
}

function projectedFinishDate(outcome: ProjectFillOutcome, referenceMs: number): string | null {
  const days =
    outcome === "likely-to-fill" ? 14 : outcome === "at-risk" ? 28 : 45;
  const date = new Date(referenceMs);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildProjectFillForecasts(input: {
  coverage: CoverageRiskSnapshot;
  opportunities: MelOpportunity[];
  fetchedAt: string;
}): ProjectFillForecastRow[] {
  const referenceMs = Date.parse(input.fetchedAt);
  const forecasts = buildProjectForecastRows(input.coverage);
  const openById = new Map(
    input.opportunities.map((row) => [row.opportunityId, row]),
  );
  const coverageById = new Map(
    input.coverage.opportunities.map((row) => [row.opportunityId, row]),
  );

  return forecasts.map((row) => {
    const opportunity = openById.get(row.opportunityId);
    const coverageRow = coverageById.get(row.opportunityId);
    const isOpen = opportunity?.openStatus && !opportunity?.isStaffed;
    const currentFillRatePercent = isOpen
      ? Math.max(0, Math.min(100, coverageRow?.coverageScore ?? 0))
      : 100;
    const requiredFillRatePercent =
      opportunity?.priority === "high" ? 95 : opportunity?.priority === "medium" ? 85 : 75;
    const outcome = mapOutcome(row.outcome);

    return {
      opportunityId: row.opportunityId,
      projectName: row.projectName,
      client: row.client,
      currentFillRatePercent,
      requiredFillRatePercent,
      projectedFinishDate: projectedFinishDate(outcome, referenceMs),
      outcome,
      confidenceScore: row.confidenceScore,
      reason: row.reason,
    };
  });
}
