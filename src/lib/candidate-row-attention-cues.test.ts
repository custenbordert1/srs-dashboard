import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildRowAttentionCues } from "@/lib/candidate-row-attention-cues";

const REF = Date.parse("2026-05-21T12:00:00.000Z");

function sample(id: string): BreezyCandidate {
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
    resumeText: "",
  };
}

function wf(id: string, patch: Partial<CandidateWorkflowRecord>): CandidateWorkflowRecord {
  const base = buildScoredWorkflowRow(sample(id));
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? base.workflowStatus,
    notes: patch.notes ?? [],
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: patch.assignedDM ?? "Unassigned",
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? base.nextActionNeeded,
    history: patch.history ?? [],
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    updatedAt: patch.updatedAt ?? "2026-05-12T00:00:00.000Z",
  };
}

describe("candidate-row-attention-cues", () => {
  it("prioritizes needs attention over paperwork", () => {
    const row = buildScoredWorkflowRow(
      sample("a"),
      wf("a", {
        workflowStatus: "Paperwork Sent",
        recruitingActions: {
          ...emptyRecruitingActions(),
          needsFollowUp: true,
          updatedAt: new Date(REF).toISOString(),
        },
      }),
    );
    const cues = buildRowAttentionCues(row, REF);
    assert.equal(cues.length, 2);
    assert.equal(cues[0]?.id, "follow-up-overdue");
    assert.ok(cues[1]);
  });

  it("shows unassigned when no higher priority cues", () => {
    const row = buildScoredWorkflowRow(
      sample("b"),
      wf("b", {
        assignedRecruiter: "Unassigned",
        workflowStatus: "Needs Review",
        lastActionAt: "2026-05-21T08:00:00.000Z",
      }),
    );
    const cues = buildRowAttentionCues(row, REF);
    assert.equal(cues.length, 1);
    assert.equal(cues[0]?.id, "unassigned");
  });

  it("caps at two badges", () => {
    const row = buildScoredWorkflowRow(
      sample("c"),
      wf("c", {
        assignedRecruiter: "Unassigned",
        workflowStatus: "Ready for MEL",
        recruitingActions: {
          ...emptyRecruitingActions(),
          needsFollowUp: true,
          updatedAt: new Date(REF).toISOString(),
        },
      }),
    );
    assert.equal(buildRowAttentionCues(row, REF).length, 2);
  });
});
