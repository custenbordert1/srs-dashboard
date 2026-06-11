import type { BreezyCandidate } from "@/lib/breezy-api";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import type { PrioritizedOpenCall } from "@/lib/coverage-optimization/types";
import type { BreezyJob } from "@/lib/breezy-api";

function deadlinePressure(priority: MelOpportunity["priority"]): number {
  if (priority === "high") return 90;
  if (priority === "medium") return 55;
  return 25;
}

function revenueImpactScore(opportunity: MelOpportunity, openInState: number): number {
  const priorityWeight = opportunity.priority === "high" ? 40 : opportunity.priority === "medium" ? 25 : 10;
  const densityWeight = Math.min(40, openInState * 5);
  return Math.min(100, priorityWeight + densityWeight + (opportunity.projectType.toLowerCase().includes("reset") ? 15 : 0));
}

export function prioritizeOpenCalls(input: {
  opportunities: MelOpportunity[];
  coverage: CoverageRiskSnapshot | null;
  candidates: BreezyCandidate[];
  jobs: BreezyJob[];
  fetchedAt: string;
}): PrioritizedOpenCall[] {
  const open = input.opportunities.filter((row) => row.openStatus && !row.isStaffed);
  const center = buildTerritoryIntelligenceCenter({
    jobs: input.jobs,
    candidates: input.candidates,
    fetchedAt: input.fetchedAt,
    coverage: input.coverage,
    workflows: null,
  });
  const coverageById = new Map(
    input.coverage?.opportunities.map((row) => [row.opportunityId, row]) ?? [],
  );
  const applicantsByState = new Map<string, number>();
  for (const candidate of input.candidates) {
    const state = normalizeStateCode(candidate.state);
    applicantsByState.set(state, (applicantsByState.get(state) ?? 0) + 1);
  }
  const openByState = new Map<string, number>();
  for (const row of open) {
    const state = normalizeStateCode(row.state);
    openByState.set(state, (openByState.get(state) ?? 0) + 1);
  }

  const territoryHealthByDm = new Map<string, number>(
    center.territories.map((row) => [row.dmName, row.metrics.coveragePercent]),
  );

  const rows: PrioritizedOpenCall[] = open.map((opportunity) => {
    const coverageRow = coverageById.get(opportunity.opportunityId);
    const coverageRiskScore = coverageRow ? 100 - coverageRow.coverageScore : 70;
    const state = normalizeStateCode(opportunity.state);
    const applicants = applicantsByState.get(state) ?? 0;
    const applicantAvailability = Math.min(100, applicants * 8);
    const territoryHealthScore = territoryHealthByDm.get(opportunity.territoryOwner) ?? 50;
    const deadline = deadlinePressure(opportunity.priority);
    const revenue = revenueImpactScore(opportunity, openByState.get(state) ?? 1);

    const priorityScore = Math.round(
      coverageRiskScore * 0.35 +
        deadline * 0.25 +
        (100 - territoryHealthScore) * 0.15 +
        (100 - applicantAvailability) * 0.1 +
        revenue * 0.15,
    );

    return {
      opportunityId: opportunity.opportunityId,
      projectName: opportunity.projectName,
      client: opportunity.client,
      city: opportunity.city,
      state: opportunity.state,
      territoryOwner: opportunity.territoryOwner,
      priorityScore,
      coverageRiskScore,
      deadlinePressure: deadline,
      territoryHealthScore,
      applicantAvailability,
      revenueImpactScore: revenue,
      staffingRisk: coverageRow?.staffingRisk ?? "YELLOW",
    };
  });

  return rows.sort((a, b) => b.priorityScore - a.priorityScore);
}
