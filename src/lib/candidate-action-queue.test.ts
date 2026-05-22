import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateQueueBoard,
  buildLaneQueue,
  buildQueueCandidateRow,
  compareQueueRows,
  computePriorityScore,
} from "@/lib/candidate-action-queue";
import { emptyRecruitingActions, markNeedsFollowUp, scheduleFollowUpDue } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function sampleCandidate(id: string, overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-05-10",
    createdDate: "2026-05-10",
    addedDate: "2026-05-10",
    updatedDate: "2026-05-10",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "walmart reset travel merchandising planogram",
    ...overrides,
  };
}

function workflow(
  candidateId: string,
  patch: Partial<CandidateWorkflowRecord>,
): CandidateWorkflowRecord {
  const base = buildScoredWorkflowRow(sampleCandidate(candidateId));
  return {
    candidateId,
    workflowStatus: patch.workflowStatus ?? base.workflowStatus,
    notes: patch.notes ?? [],
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: patch.assignedDM ?? "Unassigned",
    lastActionAt: patch.lastActionAt ?? "2026-05-12T00:00:00.000Z",
    nextActionNeeded: patch.nextActionNeeded ?? base.nextActionNeeded,
    history: patch.history ?? [],
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    updatedAt: patch.updatedAt ?? "2026-05-12T00:00:00.000Z",
  };
}

describe("candidate-action-queue", () => {
  it("places assigned recruiter in my-open lane and excludes snoozed", () => {
    const row = buildScoredWorkflowRow(
      sampleCandidate("c1"),
      workflow("c1", { assignedRecruiter: "Taylor", workflowStatus: "Needs Review" }),
    );
    const snoozed = buildScoredWorkflowRow(
      sampleCandidate("c2"),
      workflow("c2", {
        assignedRecruiter: "Taylor",
        snoozedUntil: "2026-05-25T00:00:00.000Z",
      }),
    );
    const ref = Date.parse("2026-05-21T12:00:00.000Z");
    const lane = buildLaneQueue([row, snoozed], "my-open", "Taylor", { referenceMs: ref });
    assert.equal(lane.totalInLane, 1);
    assert.equal(lane.rows[0]?.candidateId, "c1");
  });

  it("routes follow-up due date to follow-up-due lane", () => {
    const ref = Date.parse("2026-05-21T12:00:00.000Z");
    const actions = markNeedsFollowUp(emptyRecruitingActions(), ref);
    const row = buildScoredWorkflowRow(
      sampleCandidate("c2"),
      workflow("c2", {
        recruitingActions: actions,
        followUpDueAt: scheduleFollowUpDue(ref),
        assignedRecruiter: "Taylor",
      }),
    );
    const board = buildCandidateQueueBoard([row], "Taylor", { referenceMs: ref });
    assert.equal(board.lanes["follow-up-due"].totalInLane, 1);
  });

  it("sorts higher priorityScore first", () => {
    const ref = Date.parse("2026-05-21T12:00:00.000Z");
    const low = buildQueueCandidateRow(
      buildScoredWorkflowRow(sampleCandidate("low"), workflow("low", { assignedRecruiter: "Taylor" })),
      ref,
    );
    const high = buildQueueCandidateRow(
      buildScoredWorkflowRow(
        sampleCandidate("high"),
        workflow("high", {
          assignedRecruiter: "Taylor",
          recruitingActions: { ...emptyRecruitingActions(), priorityList: true, updatedAt: new Date(ref).toISOString() },
        }),
      ),
      ref,
    );
    assert.ok(compareQueueRows(high, low, "my-open", "Taylor") < 0);
    const { score: lowScore } = computePriorityScore(low, low.sla);
    const { score: highScore } = computePriorityScore(high, high.sla);
    assert.ok(highScore > lowScore);
  });

  it("includes suggested DM on scored rows", () => {
    const row = buildScoredWorkflowRow(sampleCandidate("tx", { state: "TX" }));
    assert.equal(row.suggestedDM, "Amy Harp");
    assert.equal(row.dmNeedsAssignment, true);
  });
});
