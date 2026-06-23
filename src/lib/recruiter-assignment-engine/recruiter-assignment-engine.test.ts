import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { defaultRecruiterRosters } from "@/lib/candidate-workflow-types";
import {
  buildRecruiterAssignmentDecision,
  buildRecruiterAssignmentDecisions,
  RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD,
} from "@/lib/recruiter-assignment-engine";

function sampleCandidate(id: string, state: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-06-01",
    createdDate: "2026-06-01",
    addedDate: "2026-06-01",
    updatedDate: "2026-06-01",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state,
    zipCode: "75001",
    resumeText: "walmart reset travel merchandising planogram",
  };
}

describe("recruiter-assignment-engine", () => {
  it("assigns recruiter when territory and roster are known", () => {
    const rosters = defaultRecruiterRosters();
    const decision = buildRecruiterAssignmentDecision({
      candidate: sampleCandidate("c-1", "TX"),
      rosters,
      ownership: new Map(),
    });

    assert.equal(decision.shouldAssign, true);
    assert.equal(decision.recruiter, "Taylor");
    assert.ok(decision.confidence >= RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD);
    assert.equal(decision.territoryState, "TX");
    assert.match(decision.reason, /Territory TX/);
  });

  it("skips assignment when territory cannot be determined", () => {
    const decision = buildRecruiterAssignmentDecision({
      candidate: sampleCandidate("c-2", ""),
      rosters: defaultRecruiterRosters(),
      ownership: new Map(),
    });

    assert.equal(decision.shouldAssign, false);
    assert.match(decision.reason, /Territory state could not be determined/);
  });

  it("skips already assigned candidates", () => {
    const decision = buildRecruiterAssignmentDecision({
      candidate: sampleCandidate("c-3", "TX"),
      workflow: {
        candidateId: "c-3",
        workflowStatus: "Applied",
        notes: [],
        assignedRecruiter: "Taylor",
        assignedDM: "Unassigned",
        lastActionAt: null,
        nextActionNeeded: "Review",
        history: [],
        recruitingActions: {
          needsFollowUp: false,
          recommendInterview: false,
          paperworkPending: false,
          readyForMel: false,
        },
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
        recruiterAssignmentSource: "manual",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      rosters: defaultRecruiterRosters(),
      ownership: new Map(),
    });

    assert.equal(decision.shouldAssign, false);
  });

  it("plans assignments for unassigned candidates only", () => {
    const candidates = [sampleCandidate("c-a", "TX"), sampleCandidate("c-b", "")];
    const decisions = buildRecruiterAssignmentDecisions({
      candidates,
      workflows: {},
      rosters: defaultRecruiterRosters(),
    });

    assert.equal(decisions.length, 2);
    assert.equal(decisions[0]?.shouldAssign, true);
    assert.equal(decisions[1]?.shouldAssign, false);
  });
});
