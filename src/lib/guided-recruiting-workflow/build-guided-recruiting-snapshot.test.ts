import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { buildGuidedRecruitingSnapshot } from "@/lib/guided-recruiting-workflow/build-guided-recruiting-snapshot";
import { pickWorkNextCandidate, resolveWorkNextTier } from "@/lib/guided-recruiting-workflow/work-next-priority";
import { buildQueueCandidateRow } from "@/lib/candidate-action-queue";

const REF = Date.parse("2026-05-28T15:00:00.000Z");

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: patch.candidateId ?? "cand-1",
    firstName: patch.firstName ?? "Sarah",
    lastName: patch.lastName ?? "Bixler",
    email: patch.email ?? "sarah@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: patch.stage ?? "Applied",
    appliedDate: patch.appliedDate ?? "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-20",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: patch.positionName ?? "Retail Merchandiser",
    city: patch.city ?? "Atlanta",
    state: patch.state ?? "GA",
    zipCode: "30301",
    resumeText: "merchandising reset walmart",
    hasResume: true,
  };
}

function scored(
  patch: Partial<BreezyCandidate> = {},
  workflow?: Parameters<typeof buildScoredWorkflowRow>[1],
) {
  return buildScoredWorkflowRow(sampleCandidate(patch), workflow);
}

describe("guided recruiting workflow", () => {
  it("prioritizes ready for MEL over paperwork and follow-up", () => {
    const melReady = scored({ candidateId: "mel" }, {
      workflowStatus: "Ready for MEL",
      assignedRecruiter: "Taylor",
      lastActionAt: "2026-05-28T10:00:00.000Z",
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });
    const paperwork = scored({ candidateId: "pw" }, {
      workflowStatus: "Paperwork Needed",
      assignedRecruiter: "Taylor",
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });
    const followUp = scored({ candidateId: "fu" }, {
      workflowStatus: "Qualified",
      assignedRecruiter: "Taylor",
      recruitingActions: { ...emptyRecruitingActions(), needsFollowUp: true },
      followUpDueAt: "2026-05-28T12:00:00.000Z",
      history: [],
    });

    const next = pickWorkNextCandidate([paperwork, followUp, melReady], "Taylor", { referenceMs: REF });
    assert.equal(next?.candidateId, "mel");
    assert.equal(resolveWorkNextTier(buildQueueCandidateRow(melReady, REF)), "ready-mel");
  });

  it("builds next best action card with reason and inbox", () => {
    const candidate = scored({}, {
      workflowStatus: "Paperwork Needed",
      assignedRecruiter: "Taylor",
      assignedDM: "Jordan",
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });

    const snapshot = buildGuidedRecruitingSnapshot({
      candidates: [candidate],
      actingRecruiter: "Taylor",
      referenceMs: REF,
      recruiters: ["Taylor"],
    });

    assert.ok(snapshot.nextBestAction);
    assert.equal(snapshot.nextBestAction?.candidateName, "Sarah Bixler");
    assert.match(snapshot.nextBestAction?.projectLabel, /Retail Merchandiser/);
    assert.match(snapshot.nextBestAction?.recommendedAction ?? "", /Send|Paperwork|packet/i);
    assert.equal(snapshot.inbox.length, 1);
    assert.equal(snapshot.inbox[0]?.reasonId, "paperwork-waiting");
  });

  it("respects skipped candidates when picking work next", () => {
    const only = scored({ candidateId: "only" }, {
      workflowStatus: "Ready for MEL",
      assignedRecruiter: "Taylor",
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });
    const next = pickWorkNextCandidate([only], "Taylor", {
      referenceMs: REF,
      skippedCandidateIds: ["only"],
    });
    assert.equal(next, null);
  });

  it("counts overdue follow-ups separately from today", () => {
    const overdue = scored({ candidateId: "od" }, {
      workflowStatus: "Qualified",
      assignedRecruiter: "Taylor",
      recruitingActions: { ...emptyRecruitingActions(), needsFollowUp: true },
      followUpDueAt: "2026-05-26T12:00:00.000Z",
      history: [],
    });
    const today = scored({ candidateId: "td" }, {
      workflowStatus: "Qualified",
      assignedRecruiter: "Taylor",
      recruitingActions: { ...emptyRecruitingActions(), needsFollowUp: true },
      followUpDueAt: "2026-05-28T18:00:00.000Z",
      history: [],
    });

    const snapshot = buildGuidedRecruitingSnapshot({
      candidates: [overdue, today],
      actingRecruiter: "Taylor",
      referenceMs: REF,
    });

    assert.equal(snapshot.followUpQueue.overdue, 1);
    assert.equal(snapshot.followUpQueue.today, 1);
  });
});
