import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildPlacementFunnel } from "@/lib/placement-command-center/build-placement-funnel";
import { buildPlacementCommandCenterSnapshot } from "@/lib/placement-command-center/build-placement-command-center-snapshot";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: patch.candidateId ?? "cand-1",
    firstName: patch.firstName ?? "Alex",
    lastName: patch.lastName ?? "Lee",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: patch.stage ?? "Applied",
    appliedDate: "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-28",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Atlanta",
    state: "GA",
    zipCode: "30301",
    resumeText: "reset merchandising",
    hasResume: true,
  };
}

function sampleCoverage(): CoverageRiskSnapshot {
  return {
    fetchedAt: "2026-05-28T15:00:00.000Z",
    territoryStates: null,
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Reset Project",
        client: "Walmart",
        storeName: "Store 101",
        city: "Atlanta",
        state: "GA",
        territoryOwner: "Amy Harp",
        priority: "high",
        nearby: {
          within10: 0,
          within25: 1,
          within50: 2,
          activeWithin50: 1,
          inactiveWithin50: 1,
        },
        activeRepDensity: 1,
        skillMatchScore: 40,
        recentLoginScore: 30,
        territoryAlignmentScore: 50,
        pipelineScore: 20,
        coverageScore: 35,
        staffingRisk: "RED",
        recommendedAction: "Assign rep",
        topRecommendedReps: [],
      },
    ],
    executiveSummary: {
      totalOpenOpportunities: 1,
      highRiskProjectCount: 1,
      yellowRiskProjectCount: 0,
      zeroNearbyRepProjects: 1,
      averageCoverageScore: 35,
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

function sampleOpportunity(): MelOpportunity {
  return {
    opportunityId: "opp-1",
    projectName: "Reset Project",
    client: "Walmart",
    storeAddress: "123 Main",
    storeName: "Store 101",
    city: "Atlanta",
    state: "GA",
    projectType: "Reset",
    priority: "high",
    openStatus: true,
    territoryOwner: "Amy Harp",
    storeCall: "1",
    projectNo: "P-100",
    isStaffed: false,
  };
}

describe("placement-command-center", () => {
  it("builds funnel stages with counts", () => {
    const funnel = buildPlacementFunnel({
      candidates: [sampleCandidate()],
      workflows: {
        "cand-1": {
          candidateId: "cand-1",
          workflowStatus: "Applied",
          notes: [],
          assignedRecruiter: "Taylor",
          assignedDM: "Amy Harp",
          lastActionAt: null,
          nextActionNeeded: "Review",
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
          paperworkStatus: "not_sent",
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
          updatedAt: "2026-05-28T15:00:00.000Z",
        },
      },
      fetchedAt: "2026-05-28T15:00:00.000Z",
    });

    assert.ok(funnel.some((row) => row.id === "applied" && row.count >= 1));
  });

  it("builds placement command center snapshot", () => {
    const snapshot = buildPlacementCommandCenterSnapshot({
      jobs: [],
      candidates: [sampleCandidate()],
      workflows: null,
      fetchedAt: "2026-05-28T15:00:00.000Z",
      coverage: sampleCoverage(),
      opportunities: [sampleOpportunity()],
      activeReps: [],
    });

    assert.equal(snapshot.storeCoverage.length, 1);
    assert.ok(snapshot.projectForecasts.length >= 1);
    assert.ok(snapshot.openCallRecovery.length >= 1);
    assert.equal(snapshot.summary.totalOpenCalls, 1);
  });
});
