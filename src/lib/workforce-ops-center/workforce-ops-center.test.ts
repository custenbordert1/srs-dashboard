import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  assessMelIntegrationReadiness,
  buildMelLoadDispatch,
  buildWorkforceOpsCenterSnapshot,
  MEL_INTEGRATION_CAPABILITIES,
} from "@/lib/workforce-ops-center";

function sampleCandidate(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Rep",
    email: "alex@test.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Hired",
    appliedDate: "2026-05-20",
    createdDate: "",
    addedDate: "",
    updatedDate: "2026-05-20",
    addedDateSource: "",
    positionId: "j1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
    hasResume: false,
    ...overrides,
  };
}

describe("workforce-ops-center", () => {
  it("exposes future-ready MEL integration capabilities", () => {
    assert.equal(MEL_INTEGRATION_CAPABILITIES.writebackApi, "stub");
    assert.ok(MEL_INTEGRATION_CAPABILITIES.repQualityScoring);
  });

  it("assesses MEL readiness for signed candidates", () => {
    const candidate = sampleCandidate();
    const readiness = assessMelIntegrationReadiness(
      candidate,
      {
        candidateId: "c1",
        workflowStatus: "Signed",
        notes: [],
        assignedRecruiter: "Taylor",
        assignedDM: "Amy Harp",
        lastActionAt: "2026-05-20T12:00:00.000Z",
        nextActionNeeded: "Load MEL",
        history: [],
        recruitingActions: {
          dmReview: false,
          recommendInterview: false,
          needsFollowUp: false,
          priorityList: false,
          onboardingPacketPrep: true,
          updatedAt: "2026-05-20T12:00:00.000Z",
        },
        followUpDueAt: null,
        snoozedUntil: null,
        signatureRequestId: null,
        paperworkTemplateKey: null,
        paperworkSentAt: "2026-05-18T12:00:00.000Z",
        paperworkViewedAt: null,
        paperworkViewCount: 0,
        paperworkSignedAt: "2026-05-19T12:00:00.000Z",
        paperworkStatus: "signed",
        paperworkError: null,
        onboardingContactEmail: "alex@test.com",
        directDepositStatus: "not_requested",
        directDepositRequestedAt: null,
        directDepositLastReminderAt: null,
        directDepositNotes: null,
        directDepositTriggeredByUserId: null,
      },
      [],
      Date.parse("2026-05-28T12:00:00.000Z"),
    );
    assert.equal(readiness.melReady, true);
    assert.ok(["ready", "push-pending", "assigned"].includes(readiness.pipelineStatus));
  });

  it("builds MEL load dispatch payload", () => {
    const dispatch = buildMelLoadDispatch(sampleCandidate(), {
      candidateId: "c1",
      opportunityId: "opp-1",
    });
    assert.equal(dispatch.status, "stub");
    assert.equal(dispatch.payload.candidateId, "c1");
    assert.equal(dispatch.payload.opportunityId, "opp-1");
  });

  it("builds workforce ops center snapshot", () => {
    const opportunities: MelOpportunity[] = [
      {
        opportunityId: "o1",
        projectName: "Reset",
        client: "Retail",
        storeAddress: "1 Main",
        storeName: "Store 1",
        city: "Dallas",
        state: "TX",
        projectType: "Reset",
        priority: "high",
        openStatus: true,
        territoryOwner: "Amy Harp",
        storeCall: "SC1",
        projectNo: "P1",
        isStaffed: false,
      },
      {
        opportunityId: "o2",
        projectName: "Done",
        client: "Retail",
        storeAddress: "2 Main",
        storeName: "Store 2",
        city: "Houston",
        state: "TX",
        projectType: "Reset",
        priority: "medium",
        openStatus: false,
        territoryOwner: "Amy Harp",
        storeCall: "SC2",
        projectNo: "P2",
        isStaffed: true,
      },
    ];

    const center = buildWorkforceOpsCenterSnapshot({
      jobs: [],
      candidates: [sampleCandidate()],
      workflows: null,
      opportunities,
      activeReps: [
        {
          repId: "r1",
          name: "Rep One",
          city: "Dallas",
          state: "TX",
          zip: "75001",
          lat: null,
          lng: null,
          active: true,
          skills: [],
          travelRadius: 50,
          lastProjectDate: null,
          completionRate: 90,
          noShowRate: 0,
          dmOwner: "Amy Harp",
          melStatus: "active",
          trainingStatus: "certified",
          openAssignments: 2,
          completedAssignments: 10,
          dateOfHire: "2026-05-10",
        },
      ],
      coverage: null,
      fetchedAt: "2026-05-28T12:00:00.000Z",
    });

    assert.ok(center.workforceHealth.openCalls >= 1);
    assert.ok(center.melOpportunities.rows.length === 2);
    assert.ok(center.executiveRollup.territoryFillRates.length > 0);
    assert.ok(center.territoryDrilldowns.length > 0);
  });
});
