import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildRecruiterFitSignals,
  buildRecruiterScanCues,
  deriveRecruiterNextAction,
  resolveRecruiterNextAction,
} from "@/lib/recruiter-candidate-intelligence";

const REF = Date.parse("2026-05-21T12:00:00.000Z");

function sample(id: string, resumeText = ""): BreezyCandidate {
  return {
    candidateId: id,
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
    resumeText,
    hasResume: resumeText.length > 0,
  };
}

function wf(id: string, patch: Partial<CandidateWorkflowRecord>): CandidateWorkflowRecord {
  const base = buildScoredWorkflowRow(sample(id, "walmart reset merchandising travel 50 miles"));
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? base.workflowStatus,
    notes: patch.notes ?? [],
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: patch.assignedDM ?? "Unassigned",
    lastActionAt: patch.lastActionAt ?? "2026-05-21T08:00:00.000Z",
    nextActionNeeded: patch.nextActionNeeded ?? base.nextActionNeeded,
    history: patch.history ?? [],
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    updatedAt: patch.updatedAt ?? "2026-05-12T00:00:00.000Z",
  };
}

describe("recruiter-candidate-intelligence", () => {
  it("prioritizes follow-up overdue in next action", () => {
    const row = buildScoredWorkflowRow(
      sample("a"),
      wf("a", {
        recruitingActions: {
          ...emptyRecruitingActions(),
          needsFollowUp: true,
          updatedAt: "2026-05-18T00:00:00.000Z",
        },
        followUpDueAt: "2026-05-19T00:00:00.000Z",
      }),
    );
    const action = deriveRecruiterNextAction(row, REF);
    assert.match(action, /overdue/i);
  });

  it("surfaces interview-ready next action", () => {
    const row = buildScoredWorkflowRow(
      sample("b"),
      wf("b", {
        recruitingActions: {
          ...emptyRecruitingActions(),
          recommendInterview: true,
        },
      }),
    );
    assert.match(deriveRecruiterNextAction(row, REF), /interview/i);
  });

  it("scan cues cap at two with follow-up before fit", () => {
    const row = buildScoredWorkflowRow(
      sample("c"),
      wf("c", {
        assignedRecruiter: "Unassigned",
        recruitingActions: {
          ...emptyRecruitingActions(),
          needsFollowUp: true,
          updatedAt: "2026-05-18T00:00:00.000Z",
        },
      }),
    );
    const cues = buildRecruiterScanCues(row, REF, 2);
    assert.equal(cues.length, 2);
    assert.equal(cues[0]?.id, "follow-up-overdue");
  });

  it("keeps persisted custom next action", () => {
    const row = buildScoredWorkflowRow(
      sample("d"),
      wf("d", { nextActionNeeded: "Call after store manager intro" }),
    );
    assert.equal(
      resolveRecruiterNextAction(row, row.workflowStatus, "Call after store manager intro"),
      "Call after store manager intro",
    );
  });

  it("builds fit signals from match and tags", () => {
    const row = buildScoredWorkflowRow(
      sample("e", "walmart reset audit grocery travel regional"),
      wf("e", {}),
    );
    const signals = buildRecruiterFitSignals(row, 2);
    assert.ok(signals.length >= 1);
    assert.ok(signals.some((s) => s.label.toLowerCase().includes("match") || s.id === "exp-tag"));
  });
});
