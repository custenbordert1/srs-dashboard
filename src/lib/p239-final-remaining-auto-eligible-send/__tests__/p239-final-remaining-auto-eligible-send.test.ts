import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import {
  P239_APPROVED_BY,
  P239_MAX_BATCH,
  assertP239LiveAuthorized,
  assertP239WriteBudget,
  authorizeP239Mode,
  diffP239GlobalStore,
  p239IsCalvinBrown,
  selectP239FinalRemaining,
} from "@/lib/p239-final-remaining-auto-eligible-send";

function wf(overrides: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "c1",
    workflowStatus: "Applied",
    assignedRecruiter: "Taylor",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
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
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function cand(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Test",
    lastName: "Candidate",
    email: "test@example.com",
    phone: "555-010-1234",
    stage: "Applied",
    source: "Indeed",
    appliedDate: "2026-07-20T12:00:00.000Z",
    addedDate: "2026-07-20T12:00:00.000Z",
    positionId: "pos-1",
    positionName: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zipCode: "43215",
    ...overrides,
  } as BreezyCandidate;
}

function job(overrides: Partial<BreezyJob> = {}): BreezyJob {
  return {
    jobId: "pos-1",
    name: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zip: "43215",
    displayLocation: "Columbus, OH",
    locationSource: "location.city+location.state",
    status: "published",
    createdDate: "",
    updatedDate: "",
    ...overrides,
  } as BreezyJob;
}

describe("P239 authorization", () => {
  it("requires exact live approval flags", () => {
    const denied = authorizeP239Mode(["--live"]);
    assert.equal(denied.approved, false);

    const ok = authorizeP239Mode([
      "--live",
      "--operator-approved",
      `--approved-by=${P239_APPROVED_BY}`,
    ]);
    assert.equal(ok.approved, true);
    assert.doesNotThrow(() => assertP239LiveAuthorized(ok));
  });

  it("enforces max write budget of 7", () => {
    assert.doesNotThrow(() => assertP239WriteBudget(7));
    assert.throws(() => assertP239WriteBudget(8));
    assert.equal(P239_MAX_BATCH, 7);
  });
});

describe("P239 exclusions", () => {
  it("excludes Calvin Brown by name", () => {
    assert.equal(p239IsCalvinBrown("Calvin Brown"), true);
    assert.equal(p239IsCalvinBrown("Someone Else"), false);
  });

  it("only evaluates batch_full seed and excludes prior P238", async () => {
    const ids = ["seed-1", "seed-2", "prior-p238"];
    const workflows: Record<string, CandidateWorkflowRecord> = {};
    const candidatesById = new Map<string, BreezyCandidate>();
    const jobsByPositionId = new Map<string, BreezyJob>([["pos-1", job()]]);

    for (const [i, id] of ids.entries()) {
      workflows[id] = wf({ candidateId: id });
      candidatesById.set(
        id,
        cand({
          candidateId: id,
          email: `user${i}@example.com`,
          appliedDate: `2026-07-15T${String(12 - i).padStart(2, "0")}:00:00.000Z`,
        }),
      );
    }

    const selection = await selectP239FinalRemaining({
      batchFullCandidateIds: ids,
      priorExcluded: {
        p221: new Set(),
        p227: new Set(),
        p235: new Set(),
        p237: new Set(),
        p238: new Set(["prior-p238"]),
      },
      workflows,
      candidatesById,
      jobsByPositionId,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.96, lng: -83.0 }],
      allowNetworkGeocode: false,
    });

    assert.equal(selection.p238BatchFullPoolSize, 3);
    assert.ok(selection.selectedCount <= 7);
    assert.ok(selection.exclusions.some((e) => e.reason === "prior_batch_p238"));
    assert.ok(!selection.selected.some((s) => s.candidateId === "prior-p238"));
  });
});

describe("P239 global diff", () => {
  it("flags non-target changes", () => {
    const before = {
      a: { candidateId: "a", workflowStatus: "Applied", assignedDM: "Unassigned" },
      b: { candidateId: "b", workflowStatus: "Applied", assignedDM: "Unassigned" },
    };
    const after = {
      a: { candidateId: "a", workflowStatus: "Paperwork Sent", assignedDM: "Mindie Rodriguez" },
      b: { candidateId: "b", workflowStatus: "Applied", assignedDM: "Someone" },
    };
    const diff = diffP239GlobalStore({
      before,
      after,
      targetIds: ["a"],
    });
    assert.equal(diff.targetOnly, false);
    assert.equal(diff.nonTargetCount, 1);
    assert.deepEqual(diff.nonTargetIdsChanged, ["b"]);
  });
});
