import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPredictiveRecommendations,
  buildPredictiveTerritoryRiskSnapshot,
  computeRiskFactors,
  computeWeightedRiskScore,
  detectRiskTrend,
  riskLevelFromScore,
} from "@/lib/predictive-territory-risk";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;
const SAMPLE_DM_2 = DISTRICT_MANAGERS[1] ?? SAMPLE_DM;

function sampleCoverage(): CoverageRiskSnapshot {
  return {
    fetchedAt: "2026-06-15T12:00:00.000Z",
    territoryStates: null,
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Houston Retail",
        client: "Acme",
        storeName: "Store 101",
        city: "Houston",
        state: "TX",
        territoryOwner: SAMPLE_DM,
        priority: "high",
        nearby: {
          within10: 0,
          within25: 1,
          within50: 2,
          activeWithin50: 1,
          inactiveWithin50: 1,
        },
        activeRepDensity: 1,
        skillMatchScore: 20,
        recentLoginScore: 10,
        territoryAlignmentScore: 15,
        pipelineScore: 18,
        coverageScore: 28,
        staffingRisk: "RED",
        recommendedAction: "Escalate",
        topRecommendedReps: [],
      },
      {
        opportunityId: "opp-2",
        projectName: "Dallas Retail",
        client: "Acme",
        storeName: "Store 202",
        city: "Dallas",
        state: "TX",
        territoryOwner: SAMPLE_DM_2,
        priority: "medium",
        nearby: {
          within10: 2,
          within25: 4,
          within50: 6,
          activeWithin50: 5,
          inactiveWithin50: 1,
        },
        activeRepDensity: 4,
        skillMatchScore: 55,
        recentLoginScore: 40,
        territoryAlignmentScore: 50,
        pipelineScore: 48,
        coverageScore: 72,
        staffingRisk: "GREEN",
        recommendedAction: "Monitor",
        topRecommendedReps: [],
      },
    ],
    executiveSummary: {
      highRiskProjectCount: 1,
      averageCoverageScore: 50,
      lowDensityStates: [],
    },
    dmAlerts: [],
  };
}

function sampleBundle(): RecruitingIntelligenceRouteBundle {
  const coverage = sampleCoverage();
  return {
    jobs: [
      {
        jobId: "job-1",
        title: "Merchandiser",
        city: "Houston",
        state: "TX",
        createdDate: "2026-06-01",
        updatedDate: "2026-06-10",
        status: "published",
      } as RecruitingIntelligenceRouteBundle["jobs"][number],
    ],
    jobsResult: {
      ok: true,
      jobs: [],
      fetchedAt: "2026-06-15T12:00:00.000Z",
    },
    candidates: [
      {
        candidateId: "cand-1",
        firstName: "Sam",
        lastName: "Applicant",
        state: "TX",
        city: "Houston",
        appliedDate: "2026-06-14",
        stage: "Applied",
        positionName: "Merchandiser",
      } as RecruitingIntelligenceRouteBundle["candidates"][number],
    ],
    workflows: {},
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Houston Retail",
        client: "Acme",
        storeAddress: "1 Main",
        storeName: "Store 101",
        city: "Houston",
        state: "TX",
        projectType: "Retail",
        priority: "high",
        openStatus: true,
        territoryOwner: SAMPLE_DM,
        storeCall: "Open",
        projectNo: "P-1",
        isStaffed: false,
      },
      {
        opportunityId: "opp-2",
        projectName: "Dallas Retail",
        client: "Acme",
        storeAddress: "2 Main",
        storeName: "Store 202",
        city: "Dallas",
        state: "TX",
        projectType: "Retail",
        priority: "medium",
        openStatus: true,
        territoryOwner: SAMPLE_DM_2,
        storeCall: "Open",
        projectNo: "P-2",
        isStaffed: false,
      },
    ],
    activeReps: [
      {
        repId: "rep-1",
        name: "Rep One",
        city: "Houston",
        state: "TX",
        zip: "77001",
        lat: null,
        lng: null,
        active: true,
        skills: [],
        travelRadius: 50,
        lastProjectDate: null,
        completionRate: 0.9,
        noShowRate: 0.1,
        dmOwner: SAMPLE_DM,
        melStatus: "active",
        trainingStatus: "certified",
        openAssignments: 1,
        completedAssignments: 5,
      },
    ],
    coverage,
    fetchedAt: "2026-06-15T12:00:00.000Z",
    candidatesResult: {
      ok: true,
      candidates: [],
      fetchedAt: "2026-06-15T12:00:00.000Z",
    },
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

describe("predictive territory risk engine", () => {
  it("computes weighted risk scores from factor inputs", () => {
    const factors = computeRiskFactors({
      openCalls: 8,
      pipelineDepth: 1,
      applicantVelocityCurrent7d: 1,
      applicantVelocityPrior7d: 4,
      hiresLast7Days: 0,
      coveragePercent: 30,
      atRiskProjectRatio: 0.8,
      highPriorityOpenRatio: 0.7,
      alertCount: 3,
      followUpCount: 2,
      overdueFollowUpCount: 1,
    });
    const score = computeWeightedRiskScore(factors);
    assert.ok(score >= 60);
    assert.equal(riskLevelFromScore(score), "high");
  });

  it("detects improving, stable, and declining trends", () => {
    assert.equal(
      detectRiskTrend({ applicantVelocityDelta: 3, coveragePercent: 70, riskScore: 40 }),
      "improving",
    );
    assert.equal(
      detectRiskTrend({ applicantVelocityDelta: 0, coveragePercent: 60, riskScore: 50 }),
      "stable",
    );
    assert.equal(
      detectRiskTrend({ applicantVelocityDelta: -3, coveragePercent: 40, riskScore: 70 }),
      "declining",
    );
  });

  it("generates recommendations for high-risk factor profiles", () => {
    const factors = computeRiskFactors({
      openCalls: 10,
      pipelineDepth: 0,
      applicantVelocityCurrent7d: 0,
      applicantVelocityPrior7d: 3,
      hiresLast7Days: 0,
      coveragePercent: 25,
      atRiskProjectRatio: 0.9,
      highPriorityOpenRatio: 0.8,
      alertCount: 4,
      followUpCount: 2,
      overdueFollowUpCount: 1,
    });
    const recommendations = buildPredictiveRecommendations({
      factors,
      dmName: SAMPLE_DM,
      zeroApplicantJobs: 2,
      recruiterWorkloadScore: 80,
    });
    assert.ok(recommendations.length >= 3);
    assert.ok(recommendations.some((row) => row.kind === "increase-ads"));
    assert.ok(recommendations.some((row) => row.kind === "refresh-jobs"));
  });

  it("ranks territories and builds executive summary from intelligence bundle", () => {
    const snapshot = buildPredictiveTerritoryRiskSnapshot({
      bundle: sampleBundle(),
      alerts: [],
      followUps: [],
    });

    assert.equal(snapshot.highestRiskTerritories.length <= 25, true);
    assert.equal(snapshot.healthiestTerritories.length <= 25, true);
    assert.ok(snapshot.highestRiskTerritories[0]!.riskScore >= snapshot.healthiestTerritories[0]!.riskScore);
    assert.ok(snapshot.executiveSummary.projectsAtRisk >= 0);
    assert.ok(snapshot.forecasts.length >= 0);
    assert.ok(snapshot.projects.length > 0);
    assert.ok(snapshot.storeClusters.length > 0);
  });

  it("builds forecasts for zero-pipeline and coverage-miss scenarios", () => {
    const snapshot = buildPredictiveTerritoryRiskSnapshot({
      bundle: sampleBundle(),
      alerts: [
        {
          id: "placement:zero-pipeline:opp-1",
          title: "Zero pipeline",
          description: "No pipeline",
          severity: "critical",
          category: "placement",
          impactScore: 90,
          recommendedAction: "placement-review",
          destination: { tabId: "placement-command-center", label: "Placement Command Center" },
          automationKind: "placement-review",
          manualOnly: true,
          createdAt: "2026-06-15T12:00:00.000Z",
          reason: "Zero pipeline",
          context: {
            opportunityId: "opp-1",
            storeName: "Store 101",
            dmName: SAMPLE_DM,
            linkedCandidates: [],
            linkedReps: [],
            dataSources: ["Recruiting Intelligence Cache"],
          },
        },
      ],
      followUps: [],
    });

    assert.ok(
      snapshot.forecasts.some((row) => row.kind === "zero-pipeline-store") ||
        snapshot.forecasts.some((row) => row.kind === "dm-coverage-miss"),
    );
    const risky = snapshot.territories.find((row) => row.dmName === SAMPLE_DM);
    assert.ok(risky);
    assert.ok(risky!.riskScore > 0);
    assert.ok(snapshot.territories.length > 0);
  });
});
