import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateExpectedOutcomes,
  buildRecruitingAutopilotSnapshot,
  buildTerritoryAutopilotRecommendations,
  computeAutopilotOpportunityScore,
  computePrioritizationScore,
  sortAutopilotRecommendations,
} from "@/lib/recruiting-autopilot";
import type { PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;

function sampleTerritoryRow(overrides: Partial<PredictiveTerritoryRiskRow> = {}): PredictiveTerritoryRiskRow {
  return {
    entityId: `dm:${SAMPLE_DM}`,
    entityType: "dm",
    label: SAMPLE_DM,
    dmName: SAMPLE_DM,
    states: ["TX"],
    riskScore: 78,
    riskLevel: "high",
    trend: "declining",
    factors: {
      openCallsPressure: 70,
      pipelineDepthRisk: 82,
      applicationVelocityRisk: 75,
      hiringVelocityRisk: 68,
      coverageGapRisk: 72,
      completionTrendRisk: 60,
      deadlinePressure: 55,
      alertVolumeRisk: 42,
      followUpBacklogRisk: 48,
    },
    openCalls: 8,
    coveragePercent: 32,
    pipelineDepth: 1,
    alertCount: 3,
    followUpCount: 2,
    recommendations: [],
    navigation: { tabId: "executive-alerts", label: "Open Executive Alerts" },
    ...overrides,
  };
}

function minimalBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates: [],
    workflows: {},
    opportunities: [],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: null,
      opportunities: [],
      executiveSummary: {
        totalOpenOpportunities: 0,
        highRiskProjectCount: 0,
        yellowRiskProjectCount: 0,
        zeroNearbyRepProjects: 0,
        averageCoverageScore: 0,
        lowDensityStates: [],
        highOpportunityLowRepMarkets: [],
      },
      dmAlerts: {
        highRiskProjects: [],
        noNearbyReps: [],
        recruitingUrgency: [],
        bestAvailableReps: [],
      },
    },
    fetchedAt: "2026-06-15T12:00:00.000Z",
    candidatesResult: { ok: true, candidates: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    melOk: true,
    intelligenceCache: {
      cacheStatus: "hit",
      snapshotAgeMs: 1000,
      hitCount: 1,
      missCount: 0,
      lastRefreshAt: "2026-06-15T12:00:00.000Z",
    },
  };
}

describe("recruiting autopilot recommendation engine", () => {
  it("computes opportunity scores and expected ROI", () => {
    const opportunity = computeAutopilotOpportunityScore({
      currentRisk: 78,
      impactScore: 82,
      confidenceScore: 70,
      openCalls: 8,
      pipelineDepth: 1,
      coveragePercent: 32,
      hiringVelocityRisk: 68,
      deadlinePressure: 55,
    });
    assert.ok(opportunity.potentialImprovement > 0);
    assert.ok(opportunity.estimatedCandidateGain > 0);
    assert.ok(opportunity.estimatedCoverageGain > 0);
    assert.ok(opportunity.expectedRoiScore > 0);
    assert.equal(opportunity.currentRisk, 78);
  });

  it("aggregates expected outcomes for executive summary", () => {
    const outcomes = aggregateExpectedOutcomes([
      {
        estimatedCandidateGain: 10,
        estimatedCoverageGain: 8,
        potentialImprovement: 20,
        currentRisk: 70,
      },
      {
        estimatedCandidateGain: 6,
        estimatedCoverageGain: 5,
        potentialImprovement: 15,
        currentRisk: 60,
      },
    ]);
    assert.equal(outcomes.expectedAdditionalCandidates, 16);
    assert.equal(outcomes.expectedAdditionalHires, 4);
    assert.equal(outcomes.expectedAdditionalStoreCoverage, 13);
    assert.ok(outcomes.expectedRiskReduction > 0);
  });

  it("ranks recommendations by prioritization score", () => {
    const low = buildTerritoryAutopilotRecommendations([
      sampleTerritoryRow({ riskScore: 45, factors: { ...sampleTerritoryRow().factors, pipelineDepthRisk: 30 } }),
    ]);
    const high = buildTerritoryAutopilotRecommendations([sampleTerritoryRow({ riskScore: 88 })]);
    const sorted = sortAutopilotRecommendations([...low, ...high]);
    assert.ok(sorted[0]!.prioritizationScore >= sorted[sorted.length - 1]!.prioritizationScore);
  });

  it("computes prioritization using risk, coverage, velocity, deadline, and historical effectiveness", () => {
    const score = computePrioritizationScore({
      impactScore: 80,
      confidenceScore: 70,
      currentRisk: 75,
      estimatedCoverageGain: 12,
      estimatedCandidateGain: 8,
      hiringVelocityRisk: 65,
      deadlinePressure: 55,
      kind: "launch-territory-blitz",
    });
    assert.ok(score >= 50);
    assert.ok(score <= 100);
  });

  it("generates recommendations with deep-link navigation targets", () => {
    const recommendations = buildTerritoryAutopilotRecommendations([sampleTerritoryRow()]);
    assert.ok(recommendations.length > 0);
    const navTabs = new Set(recommendations.map((row) => row.navigation.tabId));
    assert.ok(navTabs.has("candidates") || navTabs.has("placement-command-center") || navTabs.has("executive-alerts"));
    for (const row of recommendations) {
      assert.ok(row.impactScore >= 0 && row.impactScore <= 100);
      assert.ok(row.confidenceScore >= 0 && row.confidenceScore <= 100);
      assert.ok(row.supportingMetrics.length > 0);
      assert.ok(row.reasoning.length > 0);
    }
  });

  it("builds full autopilot snapshot with top 10 actions today", () => {
    const snapshot = buildRecruitingAutopilotSnapshot({ bundle: minimalBundle(), alerts: [], followUps: [] });
    assert.equal(snapshot.executiveSummary.topActionsToday.length <= 10, true);
    assert.ok(Array.isArray(snapshot.highestImpact));
    assert.ok(Array.isArray(snapshot.quickWins));
    assert.ok(Array.isArray(snapshot.longTerm));
    assert.ok(typeof snapshot.byDm === "object");
    assert.ok(typeof snapshot.byProject === "object");
  });
});
