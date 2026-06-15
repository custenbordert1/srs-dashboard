import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center";
import { buildCompanyHealthScore } from "@/lib/executive-operations-center/build-company-health-score";
import type { TerritoryIntelligenceCenterSnapshot } from "@/lib/territory-intelligence";

function emptyCoverage(): CoverageRiskSnapshot {
  return {
    fetchedAt: "2026-05-28T12:00:00.000Z",
    territoryStates: null,
    opportunities: [],
    executiveSummary: {
      totalOpenOpportunities: 0,
      highRiskProjectCount: 0,
      yellowRiskProjectCount: 0,
      zeroNearbyRepProjects: 0,
      averageCoverageScore: 72,
      lowDensityStates: [],
      highOpportunityLowRepMarkets: [],
    },
    dmAlerts: {
      highRiskProjects: [],
      noNearbyReps: [],
      recruitingUrgency: [],
      bestAvailableReps: [],
    },
  };
}

function emptyTerritoryCenter(): TerritoryIntelligenceCenterSnapshot {
  return {
    fetchedAt: "2026-05-28T12:00:00.000Z",
    territories: [],
    executiveRollup: { highestRiskTerritories: [], healthiestTerritories: [] },
    orgHeatMap: [],
  };
}

describe("executive-operations-center", () => {
  it("computes company health tier from blended signals", () => {
    const health = buildCompanyHealthScore({
      coverage: emptyCoverage(),
      territoryCenter: emptyTerritoryCenter(),
      candidates: [],
      fetchedAt: "2026-05-28T12:00:00.000Z",
      recruiterWorkloads: [],
      projectRisks: [],
      criticalActionCount: 0,
    });
    assert.ok(health.score >= 0 && health.score <= 100);
    assert.ok(["critical", "at-risk", "stable", "healthy"].includes(health.tier));
  });

  it("builds executive operations snapshot with action board", () => {
    const center = buildExecutiveOperationsCenterSnapshot({
      jobs: [],
      candidates: [],
      workflows: {},
      fetchedAt: "2026-05-28T12:00:00.000Z",
      coverage: emptyCoverage(),
      opportunities: [],
      activeReps: [],
      workforceQueue: [],
    });
    assert.ok(center.actionBoard.length <= 25);
    assert.ok(center.riskSummaries.criticalActions.label === "Critical Actions");
    assert.ok(Array.isArray(center.projectForecasts));
  });
});
