import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import { normalizeWorkflowRecord } from "@/lib/candidate-workflow-types";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import type { ImpactModelContext } from "@/lib/coverage-optimization-simulator/impact-model";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import {
  buildCoverageForecastRows,
  buildDmCapacityRows,
  buildHiringForecastPoints,
  buildRecruiterCapacityRows,
  buildResourceBalancingRecommendations,
  buildStaffingRiskAreas,
  buildWorkforceCapacityForecastSnapshot,
  capacityStateFromPercent,
} from "@/lib/workforce-capacity-forecast";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";

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
    candidates: [
      sampleCandidate(),
      sampleCandidate({ candidateId: "c2", firstName: "Alex" }),
      sampleCandidate({ candidateId: "c3", firstName: "Sam", stage: "hired" }),
    ],
    workflows: {
      c1: normalizeWorkflowRecord("c1", {
        assignedRecruiter: RECRUITER_NAME,
        workflowStatus: "Qualified",
        lastActionAt: "2026-04-10T00:00:00.000Z",
        recruitingActions: { needsFollowUp: true },
      }),
      c2: normalizeWorkflowRecord("c2", {
        assignedRecruiter: RECRUITER_NAME,
        workflowStatus: "Paperwork Sent",
        lastActionAt: "2026-05-01T00:00:00.000Z",
      }),
      c3: normalizeWorkflowRecord("c3", {
        assignedRecruiter: RECRUITER_NAME,
        workflowStatus: "Active Rep",
        lastActionAt: "2026-06-10T00:00:00.000Z",
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

function sampleImpactContext(): ImpactModelContext {
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

describe("workforce capacity forecast calculations", () => {
  it("maps capacity percent to expected states", () => {
    assert.equal(capacityStateFromPercent(30), "underutilized");
    assert.equal(capacityStateFromPercent(55), "healthy");
    assert.equal(capacityStateFromPercent(80), "busy");
    assert.equal(capacityStateFromPercent(95), "overloaded");
  });

  it("builds recruiter capacity rows with workload components", () => {
    const rows = buildRecruiterCapacityRows({
      bundle: sampleBundle(),
      referenceMs: REFERENCE_MS,
    });
    assert.ok(rows.length >= 1);
    const recruiter = rows.find((row) => row.recruiterName === RECRUITER_NAME);
    assert.ok(recruiter);
    assert.ok(recruiter.candidateVolume >= 1);
    assert.ok(recruiter.openCallLoad >= 1);
    assert.ok(recruiter.capacityPercent >= 5);
    assert.ok(["underutilized", "healthy", "busy", "overloaded"].includes(recruiter.state));
  });

  it("builds DM capacity rows with score components", () => {
    const bundle = sampleBundle();
    const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
      bundle,
      alerts: [],
      followUps: [],
      referenceMs: REFERENCE_MS,
    });
    const rows = buildDmCapacityRows({
      bundle,
      riskSnapshot,
      followUps: [],
      alerts: [],
      referenceMs: REFERENCE_MS,
      dmFilter: SAMPLE_DM,
    });
    assert.equal(rows.length, 1);
    assert.ok(rows[0]!.capacityScore >= 5);
    assert.ok(rows[0]!.openCalls >= 1);
    assert.ok(rows[0]!.territoryCount >= 1);
  });
});

describe("workforce capacity hiring and coverage forecasts", () => {
  it("forecasts hires across 7/14/30/60 day horizons with confidence ranges", () => {
    const forecast = buildHiringForecastPoints({ bundle: sampleBundle() });
    assert.equal(forecast.length, 4);
    const horizons = forecast.map((row) => row.horizon);
    assert.deepEqual(horizons, ["7d", "14d", "30d", "60d"]);
    for (const point of forecast) {
      assert.ok(point.expectedHires >= 0);
      assert.ok(point.confidenceLow <= point.expectedHires);
      assert.ok(point.confidenceHigh >= point.expectedHires);
      assert.ok(point.confidenceScore >= 30);
    }
    const longer = forecast.find((row) => row.horizon === "60d")!;
    const shorter = forecast.find((row) => row.horizon === "7d")!;
    assert.ok(longer.expectedHires >= shorter.expectedHires);
  });

  it("forecasts coverage by company and territory scope", () => {
    const bundle = sampleBundle();
    const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
      bundle,
      alerts: [],
      followUps: [],
      referenceMs: REFERENCE_MS,
    });
    const rows = buildCoverageForecastRows({ bundle, riskSnapshot });
    assert.ok(rows.some((row) => row.scope === "company"));
    const company = rows.find((row) => row.scope === "company")!;
    assert.equal(company.forecasts.length, 4);
    assert.ok(company.forecasts[0]!.coveragePercent >= 0);
    assert.ok(company.forecasts[0]!.completionPercent >= 0);
  });
});

describe("workforce capacity overload detection and balancing", () => {
  it("detects recruiter and DM overload risks", () => {
    const bundle = sampleBundle();
    const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
      bundle,
      alerts: [],
      followUps: [],
      referenceMs: REFERENCE_MS,
    });
    const recruiterCapacity = buildRecruiterCapacityRows({
      bundle,
      referenceMs: REFERENCE_MS,
    }).map((row) =>
      row.recruiterName === RECRUITER_NAME
        ? { ...row, state: "overloaded" as const, capacityPercent: 95, needsHelp: true }
        : row,
    );
    const dmCapacity = buildDmCapacityRows({
      bundle,
      riskSnapshot,
      followUps: [],
      alerts: [],
      referenceMs: REFERENCE_MS,
    }).map((row) => ({ ...row, atRisk: true, capacityScore: 30 }));
    const coverageForecasts = buildCoverageForecastRows({ bundle, riskSnapshot });
    const risks = buildStaffingRiskAreas({
      recruiterCapacity,
      dmCapacity,
      coverageForecasts,
      riskSnapshot,
    });
    assert.ok(risks.some((risk) => risk.kind === "recruiter-overload"));
    assert.ok(risks.some((risk) => risk.kind === "dm-overload"));
    assert.ok(risks[0]!.riskScore >= risks[risks.length - 1]!.riskScore);
  });

  it("recommends resource balancing actions with expected impact", () => {
    const recommendations = buildResourceBalancingRecommendations({
      ctx: sampleImpactContext(),
      recruiterCapacity: [
        {
          recruiterName: RECRUITER_NAME,
          activeWorkload: 40,
          followUpVolume: 12,
          candidateVolume: 20,
          territoryLoad: 2,
          openCallLoad: 8,
          capacityPercent: 95,
          state: "overloaded",
          spareCapacityPercent: 5,
          needsHelp: true,
        },
      ],
      dmCapacity: [
        {
          dmName: SAMPLE_DM,
          territoryCount: 2,
          recruiterCount: 1,
          openCalls: 8,
          riskLoad: 80,
          followUpBacklog: 6,
          capacityScore: 30,
          state: "overloaded",
          atRisk: true,
        },
      ],
    });
    assert.equal(recommendations.length, 4);
    assert.ok(recommendations[0]!.priorityScore >= recommendations[recommendations.length - 1]!.priorityScore);
    assert.ok(recommendations.some((row) => row.kind === "move-recruiter"));
    assert.ok(recommendations.every((row) => row.confidenceScore >= 30));
  });
});

describe("workforce capacity forecast snapshot", () => {
  it("builds executive snapshot with planning dashboard and outlook", () => {
    const snapshot = buildWorkforceCapacityForecastSnapshot({
      session: executiveSession(),
      bundle: sampleBundle(),
      referenceMs: REFERENCE_MS,
    });

    assert.equal(snapshot.hiringForecast.length, 4);
    assert.ok(snapshot.recruiterCapacity.length >= 1);
    assert.ok(snapshot.dmCapacity.length >= 1);
    assert.ok(snapshot.coverageForecasts.length >= 1);
    assert.ok(snapshot.resourceBalancing.length === 4);
    assert.ok(snapshot.executiveOutlook.recommendedActions.length <= 5);
    assert.ok(snapshot.capacityPlanning.recruitersNeedingHelp.length >= 0);
    assert.ok(snapshot.executiveOutlook.headline.length > 0);
  });

  it("scopes DM snapshot to territory", () => {
    const snapshot = buildWorkforceCapacityForecastSnapshot({
      session: dmSession(),
      bundle: sampleBundle(),
      referenceMs: REFERENCE_MS,
    });

    assert.equal(snapshot.scope.scopedToTerritory, true);
    assert.ok(snapshot.scope.territoryStates.includes("TX"));
    assert.equal(snapshot.dmCapacity.length, 1);
  });
});
