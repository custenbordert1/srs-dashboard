import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCommandCenterDmInsights,
  buildCommandCenterRecruitingHealth,
  COMMAND_CENTER_DM_COVERAGE_THRESHOLD,
} from "@/lib/command-center-dm-insights";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";

function job(state: string): BreezyJob {
  return {
    jobId: `job-${state}`,
    name: "Role",
    city: "City",
    state,
    zip: "",
    displayLocation: "",
    locationSource: "raw",
    status: "published",
    createdDate: "2026-01-01",
    updatedDate: "2026-01-01",
  };
}

function candidate(id: string, state: string, stage = "Applied"): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "A",
    lastName: "B",
    email: "a@b.com",
    phone: "",
    source: "",
    stage,
    appliedDate: "2026-05-20",
    createdDate: "",
    addedDate: "",
    updatedDate: "",
    addedDateSource: "",
    positionId: "p1",
    positionName: "Role",
    city: "City",
    state,
    zipCode: "",
    resumeText: "",
    hasResume: false,
  };
}

const coverageFixture: CoverageRiskSnapshot = {
  fetchedAt: new Date().toISOString(),
  territoryStates: null,
  opportunities: [
    {
      opportunityId: "o1",
      projectName: "Project A",
      client: "Client",
      storeName: "Store",
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
        openOpportunities: 3,
        activeReps: 1,
        densityRatio: 0.33,
        staffingRisk: "RED",
      },
    ],
    highOpportunityLowRepMarkets: [
      {
        state: "TX",
        territoryOwner: "Amy Harp",
        openOpportunities: 3,
        activeReps: 1,
        gapScore: 25,
      },
    ],
  },
  dmAlerts: {
    highRiskProjects: [],
    noNearbyReps: [],
    recruitingUrgency: [],
    bestAvailableReps: [],
  },
};

describe("command-center-dm-insights", () => {
  it("builds recruiting health from command center and workflows", () => {
    const workflows: CandidateWorkflowState = {
      c1: {
        candidateId: "c1",
        workflowStatus: "Ready for MEL",
        notes: [],
        assignedRecruiter: "",
        assignedDM: "",
        lastActionAt: "",
        nextActionNeeded: "",
        history: [],
        recruitingActions: emptyRecruitingActions(),
        followUpDueAt: null,
        snoozedUntil: null,
        signatureRequestId: null,
        paperworkTemplateKey: null,
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkViewCount: 0,
        paperworkSignedAt: null,
        paperworkStatus: "sent",
        paperworkError: null,
        onboardingContactEmail: null,
        directDepositStatus: "not_requested",
        directDepositRequestedAt: null,
        directDepositLastReminderAt: null,
        directDepositNotes: null,
        directDepositTriggeredByUserId: null,
        directDepositLastDeliveryMode: null,
        directDepositLastHrCopyIncluded: null,
        directDepositLastHrBccAddress: null,
        updatedAt: "",
      },
    };

    const health = buildCommandCenterRecruitingHealth({
      commandCenter: {
        applicantsLast7Days: 4,
        fetchedAt: new Date().toISOString(),
        funnel: [
          { label: "Applied", value: 2 },
          { label: "Interviewing", value: 1 },
          { label: "Hired", value: 3 },
        ],
      },
      candidates: [],
      workflows,
    });

    assert.equal(health.applicantsLast7Days, 4);
    assert.equal(health.paperworkSent, 1);
    assert.equal(health.readyForMel, 1);
    assert.equal(health.hired, 3);
  });

  it("ranks top territories needing attention", () => {
    const insights = buildCommandCenterDmInsights({
      jobs: [job("TX"), job("TX")],
      candidates: [candidate("c1", "TX")],
      fetchedAt: new Date().toISOString(),
      coverage: coverageFixture,
      workflows: null,
      commandCenter: {
        applicantsLast7Days: 1,
        fetchedAt: new Date().toISOString(),
        funnel: [],
      },
    });

    assert.equal(insights.topTerritoriesNeedingAttention.length, 7);
    assert.equal(insights.topTerritoriesNeedingAttention[0]?.dmName, "Amy Harp");
    assert.ok(insights.topTerritoriesNeedingAttention[0]!.openJobs >= 2);
    assert.equal(insights.riskAlerts.unstaffedHighPriority.length, 1);
    assert.ok(COMMAND_CENTER_DM_COVERAGE_THRESHOLD === 50);
  });
});
