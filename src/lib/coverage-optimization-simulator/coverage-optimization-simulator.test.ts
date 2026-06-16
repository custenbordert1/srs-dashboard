import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import { normalizeWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildCoverageOptimizationSimulatorSnapshot,
  buildForecastComparison,
  rankScenariosByRoi,
  simulateScenarioImpact,
  topRoiScenarios,
} from "@/lib/coverage-optimization-simulator";
import type { ImpactModelContext } from "@/lib/coverage-optimization-simulator";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";

const SAMPLE_DM = DISTRICT_MANAGERS[0] ?? "DM One";

const RECRUITER_NAME = "Jordan Miles";
const REFERENCE_MS = Date.parse("2026-06-15T12:00:00.000Z");

function executiveSession(): AuthSession {
  return {
    userId: "exec-user",
    email: "exec@example.com",
    name: "Executive User",
    role: "executive",
    territoryStates: [],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function dmSession(): AuthSession {
  return {
    userId: "dm-user",
    email: "dm@example.com",
    name: SAMPLE_DM,
    role: "dm",
    dmName: SAMPLE_DM,
    territoryStates: ["TX"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function sampleCandidate(overrides: Partial<RecruitingIntelligenceRouteBundle["candidates"][number]> = {}) {
  return {
    candidateId: overrides.candidateId ?? "c1",
    firstName: overrides.firstName ?? "Jamie",
    lastName: overrides.lastName ?? "Rivera",
    email: "jamie@example.com",
    phone: "555-0100",
    source: "web",
    stage: overrides.stage ?? "applied",
    appliedDate: overrides.appliedDate ?? "2026-04-01T00:00:00.000Z",
    createdDate: "2026-04-01T00:00:00.000Z",
    addedDate: "2026-04-01T00:00:00.000Z",
    updatedDate: "2026-04-01T00:00:00.000Z",
    addedDateSource: "creation_date" as const,
    positionId: "job-1",
    positionName: "Retail Rep",
    city: "Houston",
    state: overrides.state ?? "TX",
    zipCode: "77001",
    resumeText: "",
    hasResume: false,
    ...overrides,
  };
}

function sampleBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [
      {
        jobId: "job-1",
        title: "Retail Rep",
        state: "TX",
        city: "Houston",
        status: "published",
        createdDate: "2026-01-01T00:00:00.000Z",
        updatedDate: "2026-06-01T00:00:00.000Z",
      },
    ],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates: [sampleCandidate(), sampleCandidate({ candidateId: "c2", firstName: "Alex" })],
    workflows: {
      c1: normalizeWorkflowRecord("c1", {
        assignedRecruiter: RECRUITER_NAME,
        lastActionAt: "2026-04-10T00:00:00.000Z",
        recruitingActions: { needsFollowUp: true },
      }),
      c2: normalizeWorkflowRecord("c2", {
        assignedRecruiter: RECRUITER_NAME,
        lastActionAt: "2026-05-01T00:00:00.000Z",
      }),
    },
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Alpha",
        client: "Client",
        storeAddress: "1 Main",
        storeName: "Store 101",
        city: "Houston",
        state: "TX",
        projectType: "Retail",
        priority: "High",
        openStatus: true,
        territoryOwner: SAMPLE_DM,
        storeCall: "Open",
        projectNo: "P-1",
        isStaffed: false,
      },
      {
        opportunityId: "opp-2",
        projectName: "Beta",
        client: "Client",
        storeAddress: "2 Main",
        storeName: "Store 202",
        city: "Dallas",
        state: "TX",
        projectType: "Retail",
        priority: "High",
        openStatus: true,
        territoryOwner: SAMPLE_DM,
        storeCall: "Open",
        projectNo: "P-2",
        isStaffed: false,
      },
    ],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: ["TX"],
      opportunities: [
        {
          opportunityId: "opp-1",
          projectName: "Alpha",
          client: "Client",
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
          coverageScore: 42,
          staffingRisk: "RED",
          recommendedAction: "Escalate",
          topRecommendedReps: [],
        },
      ],
      executiveSummary: {
        totalOpenOpportunities: 2,
        highRiskProjectCount: 1,
        yellowRiskProjectCount: 1,
        zeroNearbyRepProjects: 1,
        averageCoverageScore: 42,
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
    candidatesResult: { ok: true, candidates: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    fetchedAt: "2026-06-15T12:00:00.000Z",
    melOk: true,
    intelligenceCache: {
      cacheStatus: "fresh",
      snapshotAgeMs: 0,
      source: "memory",
      hitCount: 1,
      missCount: 0,
      lastRefreshAt: "2026-06-15T12:00:00.000Z",
    },
  };
}

function sampleContext(): ImpactModelContext {
  return {
    openCalls: 8,
    coveragePercent: 62,
    predictedCoverageGap: 18,
    criticalTerritories: 2,
    recoverableCandidates: 12,
    potentialPlacements: 4,
    reEngagementCoverageGain: 6,
    pipelineDepth: 40,
    hiringVelocity: 5,
  };
}

describe("coverage optimization simulator impact model", () => {
  it("simulates positive impact for territory blitz", () => {
    const result = simulateScenarioImpact({
      kind: "territory-blitz",
      ctx: sampleContext(),
      confidenceScore: 80,
    });
    assert.ok(result.projected.additionalCandidates > 0);
    assert.ok(result.projected.coveragePercent > sampleContext().coveragePercent);
    assert.ok(result.expectedRoiScore > 0);
    assert.ok(result.confidenceLow < result.confidenceHigh);
  });

  it("ranks higher ROI scenarios first", () => {
    const scenarios = (["refresh-job-postings", "territory-blitz", "add-recruiter"] as const).map(
      (kind) => {
        const simulated = simulateScenarioImpact({ kind, ctx: sampleContext() });
        return {
          id: kind,
          kind,
          label: kind,
          impact: {
            current: {
              additionalCandidates: 0,
              additionalHires: 0,
              coveragePercent: 62,
              openCallsReduced: 0,
              riskReduction: 0,
            },
            projected: simulated.projected,
            difference: {
              additionalCandidates: simulated.projected.additionalCandidates,
              additionalHires: simulated.projected.additionalHires,
              coveragePercent:
                simulated.projected.coveragePercent - sampleContext().coveragePercent,
              openCallsReduced: simulated.projected.openCallsReduced,
              riskReduction: simulated.projected.riskReduction,
            },
          },
          expectedRoiScore: simulated.expectedRoiScore,
          confidenceScore: simulated.confidenceScore,
          confidenceLow: simulated.confidenceLow,
          confidenceHigh: simulated.confidenceHigh,
          reasoning: "test",
        };
      },
    );
    const ranked = rankScenariosByRoi(scenarios);
    assert.ok(ranked[0]!.expectedRoiScore >= ranked[ranked.length - 1]!.expectedRoiScore);
    assert.equal(topRoiScenarios(scenarios, 2).length, 2);
  });

  it("compares current vs optimized forecasts", () => {
    const comparison = buildForecastComparison({
      baseline: {
        additionalCandidates: 0,
        additionalHires: 0,
        coveragePercent: 60,
        openCallsReduced: 0,
        riskReduction: 0,
      },
      optimized: {
        additionalCandidates: 10,
        additionalHires: 3,
        coveragePercent: 72,
        openCallsReduced: 2,
        riskReduction: 15,
      },
    });
    assert.equal(comparison.coverageImprovement, 12);
    assert.equal(comparison.candidateImprovement, 10);
    assert.equal(comparison.hiringImprovement, 3);
    assert.equal(comparison.riskReduction, 15);
  });
});

describe("coverage optimization simulator snapshot", () => {
  it("builds executive snapshot with scenarios and recommendation tests", () => {
    const snapshot = buildCoverageOptimizationSimulatorSnapshot({
      session: executiveSession(),
      bundle: sampleBundle(),
      referenceMs: REFERENCE_MS,
    });

    assert.equal(snapshot.scenarios.length, 7);
    assert.ok(snapshot.topRoiScenarios.length <= 10);
    assert.ok(snapshot.recommendationTests.length >= 0);
    assert.equal(snapshot.resourceAllocations.length, 4);
    assert.ok(snapshot.optimizationSuggestions.length <= 2);
    assert.ok(snapshot.territoryOptions.length >= 0);
    assert.ok(snapshot.forecastComparison.coverageImprovement >= 0);
  });

  it("scopes territory options for DM sessions", () => {
    const snapshot = buildCoverageOptimizationSimulatorSnapshot({
      session: dmSession(),
      bundle: sampleBundle(),
      referenceMs: REFERENCE_MS,
    });

    assert.equal(snapshot.scope.scopedToTerritory, true);
    assert.ok(snapshot.scope.territoryStates.includes("TX"));
  });

  it("runs a single requested scenario", () => {
    const snapshot = buildCoverageOptimizationSimulatorSnapshot({
      session: executiveSession(),
      bundle: sampleBundle(),
      requestedScenarioKind: "re-engage-candidates",
      referenceMs: REFERENCE_MS,
    });

    assert.equal(snapshot.scenarios.length, 1);
    assert.equal(snapshot.scenarios[0]!.kind, "re-engage-candidates");
    assert.ok(snapshot.scenarios[0]!.impact.difference.additionalCandidates >= 0);
  });
});
