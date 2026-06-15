import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { buildTerritoryActionCenterSnapshot } from "@/lib/territory-action-engine";
import { categoryLabel } from "@/lib/territory-action-engine/action-scoring";

function sampleCandidate(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-20",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
    hasResume: false,
    ...overrides,
  };
}

function emptyCoverage(): CoverageRiskSnapshot {
  return {
    fetchedAt: "2026-05-28T12:00:00.000Z",
    territoryStates: null,
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Walmart Reset",
        client: "Walmart",
        storeName: "Store 101",
        city: "Dallas",
        state: "TX",
        territoryOwner: "Amy Harp",
        priority: "high",
        nearby: {
          within10: 0,
          within25: 0,
          within50: 0,
          activeWithin50: 0,
          inactiveWithin50: 0,
        },
        activeRepDensity: 0.1,
        skillMatchScore: 40,
        recentLoginScore: 20,
        territoryAlignmentScore: 50,
        pipelineScore: 25,
        coverageScore: 28,
        staffingRisk: "RED",
        recommendedAction: "Assign nearby rep or escalate",
        topRecommendedReps: [],
      },
    ],
    executiveSummary: {
      totalOpenOpportunities: 1,
      highRiskProjectCount: 1,
      yellowRiskProjectCount: 0,
      zeroNearbyRepProjects: 1,
      averageCoverageScore: 28,
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

describe("territory-action-engine", () => {
  it("exposes category labels for operational queue", () => {
    assert.equal(categoryLabel("coverage-risk"), "Coverage Risk");
    assert.equal(categoryLabel("zero-applicant-jobs"), "Zero Applicant Jobs");
  });

  it("builds prioritized action center snapshot", () => {
    const fetchedAt = "2026-05-28T12:00:00.000Z";
    const opportunities: MelOpportunity[] = [
      {
        opportunityId: "opp-1",
        projectName: "Walmart Reset",
        client: "Walmart",
        storeAddress: "1 Main St",
        storeName: "Store 101",
        city: "Dallas",
        state: "TX",
        projectType: "Reset",
        priority: "high",
        openStatus: true,
        territoryOwner: "Amy Harp",
        storeCall: "SC-1",
        projectNo: "P-1",
        isStaffed: false,
      },
    ];

    const center = buildTerritoryActionCenterSnapshot({
      jobs: [
        {
          jobId: "j1",
          name: "Merchandiser",
          city: "Dallas",
          state: "TX",
          zip: "75001",
          displayLocation: "Dallas, TX",
          locationSource: "location",
          status: "published",
          createdDate: "2026-05-01",
          updatedDate: "2026-05-20",
        },
      ],
      candidates: [sampleCandidate()],
      workflows: {},
      fetchedAt,
      coverage: emptyCoverage(),
      opportunities,
      activeReps: [],
      workforceQueue: [
        {
          id: "gap:opp-1",
          category: "coverage-gap",
          severity: "critical",
          title: "Coverage gap",
          detail: "Walmart Reset · Dallas, TX",
          dmName: "Amy Harp",
          state: "TX",
          opportunityId: "opp-1",
        },
      ],
    });

    assert.ok(center.priorityQueue.length > 0);
    assert.ok(center.executiveRollup.length <= 10);
    assert.equal(center.meta.manualOnly, true);
    assert.ok(center.projectRisks.length > 0);
    assert.ok(center.territoryPlaybooks.length >= 0);
  });
});
