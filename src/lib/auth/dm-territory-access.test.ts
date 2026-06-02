import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import { filterCandidatesByTerritory, filterJobsByTerritory } from "@/lib/auth/territory-filter";
import { filterWorkflowsForSession } from "@/lib/auth/workflow-territory-filter";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";

function dmSession(dmName: string): AuthSession {
  return {
    userId: `dm-${dmName}`,
    email: "dm@test.com",
    name: dmName,
    role: "dm",
    dmName,
    territoryStates: getAssignedStatesForDm(dmName),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

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
    createdDate: "",
    updatedDate: "",
  };
}

function candidate(id: string, state: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "A",
    lastName: "B",
    email: "a@example.com",
    phone: "",
    source: "",
    stage: "Applied",
    appliedDate: "",
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

describe("dm territory access", () => {
  it("filters jobs and candidates for Amy Harp (TX in, CA out)", () => {
    const session = dmSession("Amy Harp");
    const allowed = new Set(session.territoryStates);
    const jobs = filterJobsByTerritory([job("TX"), job("CA")], allowed);
    const candidates = filterCandidatesByTerritory(
      [candidate("c-tx", "TX"), candidate("c-ca", "CA")],
      allowed,
    );
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.state, "TX");
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.state, "TX");
  });

  it("filters workflows to territory candidates only", () => {
    const session = dmSession("Mindie Rodriguez");
    const breezy = [candidate("in-pa", "PA"), candidate("out-ca", "CA")];
    const workflows: CandidateWorkflowState = {
      "in-pa": {
        candidateId: "in-pa",
        workflowStatus: "Applied",
        notes: [],
        assignedRecruiter: "Taylor",
        assignedDM: "Mindie Rodriguez",
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
        updatedAt: "",
      },
      "out-ca": {
        candidateId: "out-ca",
        workflowStatus: "Applied",
        notes: [],
        assignedRecruiter: "Taylor",
        assignedDM: "Unassigned",
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
        updatedAt: "",
      },
    };
    const filtered = filterWorkflowsForSession(session, workflows, breezy);
    assert.equal(Object.keys(filtered).length, 1);
    assert.ok(filtered["in-pa"]);
    assert.equal(filtered["out-ca"], undefined);
  });
});
