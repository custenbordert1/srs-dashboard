import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExecutiveSummaryDisplay } from "@/lib/executive-summary/build-executive-summary-display";

describe("executive-summary display", () => {
  it("builds six primary KPIs from territory rollups", () => {
    const display = buildExecutiveSummaryDisplay({
      territory: {
        fetchedAt: "2026-05-28T12:00:00.000Z",
        territories: [
          {
            dmName: "Amy",
            states: ["TX"],
            metrics: {
              openCalls: 5,
              activeReps: 3,
              coveragePercent: 70,
              coverageTier: "moderate",
              zeroApplicantJobs: 2,
              lowApplicantFlowJobs: 1,
              coverageRiskScore: 65,
              recruiterWorkloadScore: 80,
              hiresLast7Days: 4,
              applicantVelocity: { direction: "up", current7d: 10, prior7d: 8, delta: 2 },
            },
            attentionScore: 72,
            recommendations: [],
            heatMap: [],
          },
        ],
        executiveRollup: {
          highestRiskTerritories: [],
          healthiestTerritories: [],
        },
        orgHeatMap: [],
      },
      ai: null,
      notifications: null,
      activeCandidates: 120,
      avgTimeToFillDays: 18,
      openCalls: null,
    });

    assert.equal(display.kpis.length, 6);
    assert.equal(display.kpis[0]!.label, "Open Calls");
    assert.equal(display.kpis[0]!.value, "5");
    assert.equal(display.kpis[1]!.value, "120");
  });
});
