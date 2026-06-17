import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExecutiveForecastSummary,
  classifyProjectRiskLevel,
  classifyRecommendationPriority,
  enrichProjectCompletionRisk,
  formatForecastFreshness,
  resolveForecastConfidence,
  sortRecommendationsByPriority,
  suggestedActionForProjectRisk,
} from "@/lib/executive-recruiting-forecast";
import type { ExecutiveForecastRecommendation } from "@/lib/executive-recruiting-forecast/types";

describe("executive-recruiting-forecast P44.1", () => {
  it("sorts recommendations critical before high before medium", () => {
    const rows: ExecutiveForecastRecommendation[] = [
      {
        id: "1",
        kind: "automation",
        title: "Low",
        rationale: "",
        expectedImpact: "",
        priority: "low",
        territoryLabel: null,
        owner: null,
      },
      {
        id: "2",
        kind: "escalate-dm-territory",
        title: "Critical",
        rationale: "",
        expectedImpact: "",
        priority: "critical",
        territoryLabel: "TX",
        owner: "DM",
      },
      {
        id: "3",
        kind: "refresh-job-ads",
        title: "High",
        rationale: "",
        expectedImpact: "",
        priority: "high",
        territoryLabel: "TX",
        owner: "DM",
      },
    ];
    const sorted = sortRecommendationsByPriority(rows);
    assert.equal(sorted[0]!.priority, "critical");
    assert.equal(sorted[1]!.priority, "high");
    assert.equal(sorted[2]!.priority, "low");
  });

  it("classifies territory escalation as critical when shortage score is very high", () => {
    const priority = classifyRecommendationPriority({
      kind: "escalate-dm-territory",
      territory: {
        dmName: "DM",
        territoryLabel: "TX",
        shortageScore: 90,
        projectedShortage: 5,
        openOpportunities: 8,
        activeReps: 0,
        pipelineCandidates: 1,
        likelyMissCoverage: true,
        reasons: ["No active reps in territory"],
      },
    });
    assert.equal(priority, "critical");
  });

  it("enriches project risk with level and suggested action", () => {
    const row = enrichProjectCompletionRisk({
      projectNo: "P1",
      projectName: "Reset",
      dmName: "DM",
      territoryLabel: "TX",
      riskScore: 80,
      riskLevel: "medium",
      openOpportunities: 6,
      pipelineCandidates: 0,
      nearestDeadlineDays: null,
      reasons: ["No pipeline candidates linked to project"],
      suggestedAction: "",
    });
    assert.equal(row.riskLevel, "critical");
    assert.match(row.suggestedAction, /Prioritize candidate sourcing/);
  });

  it("builds executive summary narrative with confidence label", () => {
    const summary = buildExecutiveForecastSummary({
      territoriesAtRisk: 3,
      overloadedRecruiters: 2,
      overloadedDms: 1,
      territoryShortages: [
        {
          dmName: "Texas DM",
          territoryLabel: "TX",
          shortageScore: 88,
          projectedShortage: 4,
          openOpportunities: 6,
          activeReps: 0,
          pipelineCandidates: 1,
          likelyMissCoverage: true,
          reasons: ["No active reps in territory"],
        },
      ],
      topRecommendation: {
        id: "r1",
        kind: "escalate-dm-territory",
        title: "Escalate Texas DM coverage risk",
        rationale: "",
        expectedImpact: "",
        priority: "critical",
        territoryLabel: "TX",
        owner: "Texas DM",
      },
      forecastConfidence: "moderate",
    });
    assert.match(summary.narrative, /3 territories likely to miss coverage/);
    assert.match(summary.narrative, /Forecast confidence: Moderate/);
    assert.equal(summary.topRiskTerritory?.dmName, "Texas DM");
  });

  it("formats freshness relative to generatedAt", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(formatForecastFreshness(fiveMinutesAgo), "Updated 5 minutes ago");
  });

  it("lowers forecast confidence when data trust is partial", () => {
    assert.equal(
      resolveForecastConfidence({
        dataTrust: "partial",
        recentHireCount: 10,
        candidateCount: 100,
        territoriesAtRisk: 1,
      }),
      "moderate",
    );
    assert.equal(
      resolveForecastConfidence({
        dataTrust: "degraded",
        recentHireCount: 10,
        candidateCount: 100,
        territoriesAtRisk: 1,
      }),
      "low",
    );
  });

  it("classifies project risk score bands", () => {
    assert.equal(classifyProjectRiskLevel(80), "critical");
    assert.equal(classifyProjectRiskLevel(60), "high");
    assert.equal(classifyProjectRiskLevel(40), "medium");
    assert.equal(suggestedActionForProjectRisk({
      projectNo: "P",
      projectName: "P",
      dmName: "D",
      territoryLabel: "TX",
      riskScore: 70,
      riskLevel: "high",
      openOpportunities: 6,
      pipelineCandidates: 1,
      nearestDeadlineDays: null,
      reasons: [],
      suggestedAction: "",
    }), "Rebalance recruiters toward this project's pipeline");
  });
});
