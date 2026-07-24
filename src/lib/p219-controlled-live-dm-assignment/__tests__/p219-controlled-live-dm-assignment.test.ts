import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  P219_APPROVED_BY,
  P219_MAX_CANDIDATES,
  P219_TARGETS,
  type P219PreviewDecision,
  type P219WorkflowSnapshot,
} from "@/lib/p219-controlled-live-dm-assignment/types";
import {
  assertP219WriteBudget,
  diffP219GlobalStore,
  isP219Archived,
  isP219Unassigned,
  isP219WorkflowActive,
  verifyP219PostWrite,
  verifyP219PreWrite,
  verifyP219TargetAgainstPreview,
} from "@/lib/p219-controlled-live-dm-assignment/verify";
import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";
import { authorizeP218Mode } from "@/lib/p218-automatic-dm-assignment/authorization";

function previewFor(targetIndex: 0 | 1, overrides: Partial<P219PreviewDecision> = {}): P219PreviewDecision {
  const target = P219_TARGETS[targetIndex]!;
  return {
    candidateId: target.candidateId,
    action: "would_assign",
    currentAssignedDm: "Unassigned",
    expectedAssignedDm: target.expectedDm,
    positionId: target.expectedPositionId,
    positionLocation: {
      city: target.expectedCity,
      state: target.expectedState,
      source: "location.city+location.state",
    },
    ...overrides,
  };
}

function snap(overrides: Partial<P219WorkflowSnapshot> = {}): P219WorkflowSnapshot {
  return {
    candidateId: P219_TARGETS[0]!.candidateId,
    workflowStatus: "Paperwork Needed",
    assignedDM: "Unassigned",
    assignedRecruiter: "Unassigned",
    paperworkStatus: "not_sent",
    notes: ["keep"],
    history: [{ id: "h1", type: "status", message: "Status changed to Applied.", createdAt: "t1" }],
    requiredAction: "Send onboarding paperwork",
    nextActionNeeded: "Review candidate fit",
    lastActionAt: "t0",
    updatedAt: "t0",
    ...overrides,
  };
}

describe("P219 target set", () => {
  it("freezes exactly two candidates", () => {
    assert.equal(P219_TARGETS.length, P219_MAX_CANDIDATES);
    assert.equal(P219_MAX_CANDIDATES, 2);
  });

  it("targets Columbus → Mindie and Kansas City → Amy", () => {
    assert.equal(P219_TARGETS[0]!.expectedCity, "Columbus");
    assert.equal(P219_TARGETS[0]!.expectedState, "OH");
    assert.equal(P219_TARGETS[0]!.expectedDm, "Mindie Rodriguez");
    assert.equal(P219_TARGETS[1]!.expectedCity, "Kansas City");
    assert.equal(P219_TARGETS[1]!.expectedState, "MO");
    assert.equal(P219_TARGETS[1]!.expectedDm, "Amy Harp");
  });

  it("uses distinct candidate and position ids", () => {
    assert.notEqual(P219_TARGETS[0]!.candidateId, P219_TARGETS[1]!.candidateId);
    assert.notEqual(P219_TARGETS[0]!.expectedPositionId, P219_TARGETS[1]!.expectedPositionId);
  });
});

describe("P219 unassigned / activity helpers", () => {
  it("treats null, empty, and Unassigned as unassigned", () => {
    assert.equal(isP219Unassigned(null), true);
    assert.equal(isP219Unassigned(""), true);
    assert.equal(isP219Unassigned("Unassigned"), true);
    assert.equal(isP219Unassigned("Mindie Rodriguez"), false);
  });

  it("flags inactive and archived stages", () => {
    assert.equal(isP219WorkflowActive("Paperwork Needed"), true);
    assert.equal(isP219WorkflowActive("Not Qualified"), false);
    assert.equal(isP219Archived("Paperwork Needed"), false);
    assert.equal(isP219Archived("archived"), true);
  });
});

describe("P219 preview match (Part 1)", () => {
  it("accepts an exact P218 would_assign preview", () => {
    const result = verifyP219TargetAgainstPreview(P219_TARGETS[0]!, previewFor(0));
    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
  });

  it("rejects a missing preview row", () => {
    const result = verifyP219TargetAgainstPreview(P219_TARGETS[0]!, undefined);
    assert.equal(result.ok, false);
    assert.match(result.failures[0]!, /no P218 preview/);
  });

  it("rejects wrong expected DM", () => {
    const result = verifyP219TargetAgainstPreview(
      P219_TARGETS[0]!,
      previewFor(0, { expectedAssignedDm: "Amy Harp" }),
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /expected DM mismatch/);
  });

  it("rejects Position.Location drift", () => {
    const result = verifyP219TargetAgainstPreview(
      P219_TARGETS[0]!,
      previewFor(0, {
        positionLocation: { city: "Dayton", state: "OH", source: "location.city+location.state" },
      }),
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /Position\.Location mismatch/);
  });

  it("rejects non would_assign preview actions", () => {
    const result = verifyP219TargetAgainstPreview(
      P219_TARGETS[0]!,
      previewFor(0, { action: "already_assigned" }),
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /would_assign/);
  });

  it("rejects already-assigned preview current DM", () => {
    const result = verifyP219TargetAgainstPreview(
      P219_TARGETS[0]!,
      previewFor(0, { currentAssignedDm: "Mindie Rodriguez" }),
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /Unassigned/);
  });
});

describe("P219 pre-write safety (Part 2)", () => {
  it("passes for an active Unassigned Paperwork Needed record", () => {
    const result = verifyP219PreWrite(P219_TARGETS[0]!, snap());
    assert.equal(result.ok, true);
  });

  it("aborts when workflow record is missing", () => {
    const result = verifyP219PreWrite(P219_TARGETS[0]!, undefined);
    assert.equal(result.ok, false);
    assert.match(result.failures[0]!, /missing/);
  });

  it("aborts when assignedDM is already set", () => {
    const result = verifyP219PreWrite(
      P219_TARGETS[0]!,
      snap({ assignedDM: "Mindie Rodriguez" }),
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /already/);
  });

  it("aborts for inactive stages", () => {
    const result = verifyP219PreWrite(
      P219_TARGETS[0]!,
      snap({ workflowStatus: "Not Qualified" }),
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /inactive/);
  });
});

describe("P219 post-write verification (Part 4)", () => {
  it("accepts assignedDM + timestamps + one assignment history event", () => {
    const before = snap();
    const after = snap({
      assignedDM: "Mindie Rodriguez",
      lastActionAt: "t1",
      updatedAt: "t1",
      nextActionNeeded: "Send onboarding paperwork",
      history: [
        {
          id: "h0",
          type: "assignment",
          message: "Assigned DM changed to Mindie Rodriguez.",
          createdAt: "t1",
        },
        ...(before.history ?? []),
      ],
    });
    const result = verifyP219PostWrite({ target: P219_TARGETS[0]!, before, after });
    assert.equal(result.ok, true, result.failures.join("; "));
    assert.ok(result.changedFields.some((c) => c.field === "assignedDM" && c.allowed));
  });

  it("rejects wrong persisted DM", () => {
    const before = snap();
    const after = snap({ assignedDM: "Amy Harp", lastActionAt: "t1", updatedAt: "t1" });
    const result = verifyP219PostWrite({ target: P219_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /assignedDM after write/);
  });

  it("rejects stage or recruiter mutations", () => {
    const before = snap();
    const after = snap({
      assignedDM: "Mindie Rodriguez",
      workflowStatus: "Ready For Work",
      assignedRecruiter: "Someone",
      lastActionAt: "t1",
      updatedAt: "t1",
    });
    const result = verifyP219PostWrite({ target: P219_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /disallowed field changed: workflowStatus/);
    assert.match(result.failures.join(" "), /disallowed field changed: assignedRecruiter/);
  });

  it("rejects note or paperwork mutations", () => {
    const before = snap();
    const after = snap({
      assignedDM: "Mindie Rodriguez",
      notes: ["keep", "new note"],
      paperworkStatus: "sent",
      lastActionAt: "t1",
      updatedAt: "t1",
    });
    const result = verifyP219PostWrite({ target: P219_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /notes/);
    assert.match(result.failures.join(" "), /paperworkStatus/);
  });

  it("rejects history rewrites that alter prior events", () => {
    const before = snap();
    const after = snap({
      assignedDM: "Mindie Rodriguez",
      lastActionAt: "t1",
      updatedAt: "t1",
      history: [
        { id: "h0", type: "assignment", message: "Assigned DM changed to Mindie Rodriguez.", createdAt: "t1" },
        { id: "h1", type: "status", message: "tampered", createdAt: "t1" },
      ],
    });
    const result = verifyP219PostWrite({ target: P219_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /existing history/);
  });
});

describe("P219 global safety audit (Part 6)", () => {
  it("reports exactly the two target ids when only they change", () => {
    const before = {
      [P219_TARGETS[0]!.candidateId]: snap(),
      [P219_TARGETS[1]!.candidateId]: snap({ candidateId: P219_TARGETS[1]!.candidateId }),
      other: snap({ candidateId: "other", assignedDM: "Amy Harp" }),
    };
    const after = {
      ...before,
      [P219_TARGETS[0]!.candidateId]: snap({ assignedDM: "Mindie Rodriguez", updatedAt: "t1" }),
      [P219_TARGETS[1]!.candidateId]: snap({
        candidateId: P219_TARGETS[1]!.candidateId,
        assignedDM: "Amy Harp",
        updatedAt: "t1",
      }),
    };
    const diff = diffP219GlobalStore({
      before,
      after,
      targetIds: P219_TARGETS.map((t) => t.candidateId),
    });
    assert.deepEqual(diff.targetIdsChanged.sort(), [
      P219_TARGETS[0]!.candidateId,
      P219_TARGETS[1]!.candidateId,
    ].sort());
    assert.deepEqual(diff.nonTargetIdsChanged, []);
    assert.deepEqual(diff.recordsAdded, []);
    assert.deepEqual(diff.recordsRemoved, []);
  });

  it("detects non-target writes", () => {
    const before = {
      [P219_TARGETS[0]!.candidateId]: snap(),
      other: snap({ candidateId: "other" }),
    };
    const after = {
      [P219_TARGETS[0]!.candidateId]: snap({ assignedDM: "Mindie Rodriguez", updatedAt: "t1" }),
      other: snap({ candidateId: "other", assignedDM: "Someone", updatedAt: "t1" }),
    };
    const diff = diffP219GlobalStore({
      before,
      after,
      targetIds: P219_TARGETS.map((t) => t.candidateId),
    });
    assert.deepEqual(diff.nonTargetIdsChanged, ["other"]);
  });

  it("enforces the hard write budget of 2", () => {
    assert.doesNotThrow(() => assertP219WriteBudget(2));
    assert.throws(() => assertP219WriteBudget(3), /write budget exceeded/);
  });
});

describe("P219 live authorization + eligibility", () => {
  it("requires --live --operator-approved --approved-by", () => {
    const auth = authorizeP218Mode([
      "--live",
      "--operator-approved",
      `--approved-by=${P219_APPROVED_BY}`,
    ]);
    assert.equal(auth.approved, true);
    assert.equal(auth.mode, "live");
    assert.equal(auth.approvedBy, P219_APPROVED_BY);
  });

  it("rejects live without operator approval", () => {
    const auth = authorizeP218Mode(["--live"]);
    assert.equal(auth.approved, false);
    assert.ok(auth.failures.some((f) => f.includes("--operator-approved")));
  });

  it("clears the DM gate after assignment for both P216 candidates", () => {
    for (const target of P219_TARGETS) {
      const before = evaluateP214Gates({
        nearestActiveWorkMiles: target.expectedState === "OH" ? 0 : 8.3,
        hasActiveOpportunities: true,
        coverageKnown: true,
        assignedDm: "Unassigned",
        expectedDm: target.expectedDm,
        jobCity: target.expectedCity,
        jobState: target.expectedState,
      });
      assert.equal(before.eligible, false);
      assert.ok(before.blockers.includes("blocked_dm_unassigned"));

      const after = evaluateP214Gates({
        nearestActiveWorkMiles: target.expectedState === "OH" ? 0 : 8.3,
        hasActiveOpportunities: true,
        coverageKnown: true,
        assignedDm: target.expectedDm,
        expectedDm: target.expectedDm,
        jobCity: target.expectedCity,
        jobState: target.expectedState,
      });
      assert.equal(after.eligible, true);
      assert.deepEqual(after.blockers, []);
    }
  });
});
