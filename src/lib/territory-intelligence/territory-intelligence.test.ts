import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDmTerritoryRollups,
  buildRecruitingPipelineMetrics,
  buildTerritoryMetricsFromDashboardSnapshot,
  countOpenCallsFromDemandSignals,
  resolveCoverageHealthTier,
  TERRITORY_COVERAGE_THRESHOLD,
  topTerritoriesNeedingAttention,
} from "@/lib/territory-intelligence";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";

function minimalSnapshot(): DmDashboardSnapshot {
  return {
    dmName: "Amy Harp",
    territoryStates: ["TX"],
    territoryLabel: "TX",
    fetchedAt: new Date().toISOString(),
    health: { score: 72, label: "Stable", factors: [] },
    kpis: [],
    activeJobs: 4,
    candidatesLast7Days: 9,
    interviewing: 0,
    agingJobs: 0,
    topHiringCities: [],
    candidateSources: [],
    fillRiskAlerts: [],
    needsAttention: [],
    highestFillRisk: [],
    prioritizedAlerts: [],
    alertSummary: {
      criticalCount: 1,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      agingJobsCount: 0,
      zeroApplicantJobsCount: 0,
      territoryRecruitingRiskScore: 0,
    },
    operationalIndex: { jobsById: {}, citiesByKey: {}, statesByCode: {}, alertsById: {} },
    topCandidates: [],
    recentApplicants: [],
    coverage: {
      candidateShortagesByState: [{ label: "TX", value: 3 }],
      topProblemCities: [],
      hardestToFillTerritories: [],
      hiringVelocityTrends: [],
    },
    pipeline: {
      counts: { applied: 0, interviewing: 0, hired: 2, stalled: 0 },
      applied: [],
      interviewing: [],
      hired: [],
      stalled: [],
    },
    heatmap: {
      version: 1,
      fetchedAt: new Date().toISOString(),
      territoryLabel: "TX",
      cells: [],
      meta: { cellCount: 0, avgHealthScore: 0, maxOpportunityDensity: 0 },
    },
    melMatching: {
      unstaffedHighPriorityStores: [],
      bestCandidateForOpenProjects: [{ projectName: "P", client: "C", candidateName: "N", candidateId: "c1", fitPercent: 80, distanceMiles: 1 }],
      candidatesNearAgingOpportunities: [],
    },
    onboarding: {
      paperworkSent: 2,
      paperworkSigned: 1,
      ddApproved: 1,
      ddNotRequested: 0,
      ddRequested: 0,
      ddReceived: 0,
      awaitingDdVerification: 0,
    },
  };
}

describe("territory-intelligence", () => {
  it("resolves coverage tiers consistently", () => {
    assert.equal(resolveCoverageHealthTier(80), "green");
    assert.equal(resolveCoverageHealthTier(50), "yellow");
    assert.equal(resolveCoverageHealthTier(49), "red");
    assert.equal(TERRITORY_COVERAGE_THRESHOLD, 50);
  });

  it("derives open calls from demand signals", () => {
    assert.equal(countOpenCallsFromDemandSignals({ shortageSum: 5, unstaffedMelCount: 2 }), 5);
    assert.equal(countOpenCallsFromDemandSignals({ shortageSum: 0, unstaffedMelCount: 4 }), 4);
  });

  it("builds dashboard snapshot metrics for DM portal", () => {
    const metrics = buildTerritoryMetricsFromDashboardSnapshot(minimalSnapshot());
    assert.equal(metrics.coveragePercent, 72);
    assert.equal(metrics.openJobs, 4);
    assert.equal(metrics.openCalls, 3);
    assert.equal(metrics.activeReps, 4);
    assert.equal(metrics.applicantsLast7Days, 9);
    assert.equal(metrics.hired, 2);
    assert.equal(metrics.paperworkSent, 2);
    assert.equal(metrics.readyForMel, 2);
  });

  it("builds DM rollups for command center from shared context", () => {
    const job: BreezyJob = {
      jobId: "j-tx",
      name: "Role",
      city: "City",
      state: "TX",
      zip: "",
      displayLocation: "",
      locationSource: "raw",
      status: "published",
      createdDate: "2026-01-01",
      updatedDate: "2026-01-01",
    };
    const candidate: BreezyCandidate = {
      candidateId: "c1",
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      phone: "",
      source: "",
      stage: "Applied",
      appliedDate: "2026-05-20",
      createdDate: "",
      addedDate: "",
      updatedDate: "",
      addedDateSource: "",
      positionId: "p1",
      positionName: "Role",
      city: "City",
      state: "TX",
      zipCode: "",
      resumeText: "",
      hasResume: false,
    };

    const coverage: CoverageRiskSnapshot = {
      fetchedAt: new Date().toISOString(),
      territoryStates: null,
      opportunities: [
        {
          opportunityId: "o1",
          projectName: "P",
          client: "C",
          storeName: "S",
          city: "Dallas",
          state: "TX",
          territoryOwner: "Amy Harp",
          priority: "high",
          nearby: { within10: 0, within25: 0, within50: 0, activeWithin50: 2, inactiveWithin50: 0 },
          activeRepDensity: 0,
          skillMatchScore: 0,
          recentLoginScore: 0,
          territoryAlignmentScore: 0,
          pipelineScore: 0,
          coverageScore: 20,
          staffingRisk: "RED",
          recommendedAction: "Staff",
          topRecommendedReps: [],
        },
      ],
      executiveSummary: {
        totalOpenOpportunities: 1,
        highRiskProjectCount: 1,
        yellowRiskProjectCount: 0,
        zeroNearbyRepProjects: 1,
        averageCoverageScore: 20,
        lowDensityStates: [
          {
            state: "TX",
            territoryOwner: "Amy Harp",
            openOpportunities: 1,
            activeReps: 2,
            densityRatio: 2,
            staffingRisk: "GREEN",
          },
        ],
        highOpportunityLowRepMarkets: [],
      },
      dmAlerts: {
        highRiskProjects: [],
        noNearbyReps: [],
        recruitingUrgency: [],
        bestAvailableReps: [],
      },
    };

    const rollups = buildDmTerritoryRollups({
      jobs: [job, job],
      candidates: [candidate],
      fetchedAt: new Date().toISOString(),
      coverage,
      workflows: null,
    });

    const amy = rollups.find((row) => row.dmName === "Amy Harp");
    assert.ok(amy);
    assert.equal(amy!.metrics.openJobs, 2);
    assert.equal(amy!.metrics.openCalls, 1);
    assert.equal(amy!.metrics.activeReps, 2);

    const top = topTerritoriesNeedingAttention(rollups, 5);
    assert.equal(top[0]?.dmName, "Amy Harp");
  });

  it("builds organization recruiting pipeline metrics", () => {
    const pipeline = buildRecruitingPipelineMetrics(
      {
        jobs: [],
        candidates: [],
        fetchedAt: new Date().toISOString(),
        coverage: null,
        workflows: null,
      },
      { applicantsLast7Days: 12, hired: 5 },
    );
    assert.equal(pipeline.applicantsLast7Days, 12);
    assert.equal(pipeline.hired, 5);
  });
});
