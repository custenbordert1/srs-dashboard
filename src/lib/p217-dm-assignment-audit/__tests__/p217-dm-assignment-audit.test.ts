import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyP217RootCause,
  isP217ActiveWorkflowStage,
  isP217AutomaticallyAssignable,
  isP217DmUnassigned,
  p217ExpectedDmAccuracy,
  summarizeP217GlobalAudit,
} from "@/lib/p217-dm-assignment-audit";
import type { P217CandidateAuditInput } from "@/lib/p217-dm-assignment-audit";

function candidate(
  patch: Partial<P217CandidateAuditInput> = {},
): P217CandidateAuditInput {
  return {
    candidateId: "candidate",
    workflowStage: "Paperwork Needed",
    assignedDm: "Unassigned",
    assignedRecruiter: "Unassigned",
    territory: "OH",
    expectedDm: "Mindie Rodriguez",
    positionId: "position",
    positionLookupSucceeded: true,
    positionLocationAuthoritative: true,
    previousAssignedDm: null,
    ...patch,
  };
}

describe("P217 unassigned normalization", () => {
  it("treats empty, null, and Unassigned as unassigned", () => {
    assert.equal(isP217DmUnassigned(""), true);
    assert.equal(isP217DmUnassigned(null), true);
    assert.equal(isP217DmUnassigned(" Unassigned "), true);
  });

  it("treats a real DM as assigned", () => {
    assert.equal(isP217DmUnassigned("Mindie Rodriguez"), false);
  });

  it("excludes Not Qualified from active scope", () => {
    assert.equal(isP217ActiveWorkflowStage("Not Qualified"), false);
    assert.equal(isP217ActiveWorkflowStage("Applied"), true);
    assert.equal(isP217ActiveWorkflowStage("Paperwork Sent"), true);
  });
});

describe("P217 root-cause classification", () => {
  it("classifies territory missing", () => {
    assert.equal(classifyP217RootCause(candidate({ territory: "" })), "Territory Missing");
  });

  it("classifies DM lookup failure", () => {
    assert.equal(classifyP217RootCause(candidate({ expectedDm: "" })), "DM Lookup Failure");
  });

  it("classifies assignment engine failure when deterministic inputs resolve", () => {
    assert.equal(classifyP217RootCause(candidate()), "Assignment Engine Failure");
  });

  it("classifies workflow reset before other causes", () => {
    assert.equal(
      classifyP217RootCause(candidate({ previousAssignedDm: "Mindie Rodriguez" })),
      "Workflow Reset",
    );
  });

  it("classifies sync failure when sync supplied a DM but workflow did not persist it", () => {
    assert.equal(
      classifyP217RootCause(candidate({ syncSuppliedDm: "Mindie Rodriguez" })),
      "Sync Failure",
    );
  });

  it("classifies explicit manual review", () => {
    assert.equal(
      classifyP217RootCause(candidate({ manualReviewRequired: true })),
      "Manual Assignment Required",
    );
  });

  it("classifies unknown when position lookup did not succeed", () => {
    assert.equal(
      classifyP217RootCause(candidate({ positionLookupSucceeded: false })),
      "Unknown",
    );
  });

  it("classifies unknown when position location is not authoritative", () => {
    assert.equal(
      classifyP217RootCause(candidate({ positionLocationAuthoritative: false })),
      "Unknown",
    );
  });
});

describe("P217 automatic resolution", () => {
  it("marks deterministic Position.Location routing assignable", () => {
    assert.equal(isP217AutomaticallyAssignable(candidate()), true);
  });

  it("does not overwrite an assigned DM", () => {
    assert.equal(
      isP217AutomaticallyAssignable(candidate({ assignedDm: "Mindie Rodriguez" })),
      false,
    );
  });

  it("requires position lookup and authoritative location", () => {
    assert.equal(
      isP217AutomaticallyAssignable(candidate({ positionLookupSucceeded: false })),
      false,
    );
    assert.equal(
      isP217AutomaticallyAssignable(candidate({ positionLocationAuthoritative: false })),
      false,
    );
  });

  it("requires territory and expected DM", () => {
    assert.equal(isP217AutomaticallyAssignable(candidate({ territory: "" })), false);
    assert.equal(isP217AutomaticallyAssignable(candidate({ expectedDm: "" })), false);
  });

  it("does not auto-assign explicit manual-review candidates", () => {
    assert.equal(
      isP217AutomaticallyAssignable(candidate({ manualReviewRequired: true })),
      false,
    );
  });

  it("does not auto-assign terminal candidates", () => {
    assert.equal(
      isP217AutomaticallyAssignable(candidate({ workflowStage: "Not Qualified" })),
      false,
    );
  });
});

describe("P217 global aggregation", () => {
  const rows = [
    {
      candidateId: "1",
      workflowStage: "Applied",
      assignedDm: "Unassigned",
      assignedRecruiter: "Unassigned",
      territory: "OH",
      expectedDm: "Mindie Rodriguez",
      autoAssignable: true,
    },
    {
      candidateId: "2",
      workflowStage: "Paperwork Needed",
      assignedDm: "",
      assignedRecruiter: "Taylor",
      territory: "MO",
      expectedDm: "Amy Harp",
      autoAssignable: false,
    },
    {
      candidateId: "3",
      workflowStage: "Paperwork Sent",
      assignedDm: "Amy Harp",
      assignedRecruiter: "Recruiting Team",
      territory: "MO",
      expectedDm: "Amy Harp",
      autoAssignable: false,
    },
    {
      candidateId: "4",
      workflowStage: "Not Qualified",
      assignedDm: "Unassigned",
      assignedRecruiter: "Unassigned",
      territory: "OH",
      expectedDm: "Mindie Rodriguez",
      autoAssignable: false,
    },
  ];

  it("counts active assigned and unassigned candidates", () => {
    const result = summarizeP217GlobalAudit(rows);
    assert.equal(result.totalActiveCandidates, 3);
    assert.equal(result.totalAssignedDm, 1);
    assert.equal(result.totalUnassignedDm, 2);
  });

  it("groups unassigned by stage", () => {
    const result = summarizeP217GlobalAudit(rows);
    assert.deepEqual(result.unassignedByStage, { Applied: 1, "Paperwork Needed": 1 });
  });

  it("groups unassigned by territory", () => {
    const result = summarizeP217GlobalAudit(rows);
    assert.deepEqual(result.unassignedByTerritory, { OH: 1, MO: 1 });
  });

  it("groups unassigned by recruiter", () => {
    const result = summarizeP217GlobalAudit(rows);
    assert.deepEqual(result.unassignedByRecruiter, { Unassigned: 1, Taylor: 1 });
  });

  it("counts automatically assignable candidates", () => {
    assert.equal(summarizeP217GlobalAudit(rows).automaticallyAssignable, 1);
  });
});

describe("P217 mapping accuracy", () => {
  it("reports 100% when all expected mappings match", () => {
    assert.deepEqual(
      p217ExpectedDmAccuracy([
        { expectedDm: "Mindie Rodriguez", actualMappedDm: "Mindie Rodriguez" },
        { expectedDm: "Amy Harp", actualMappedDm: "Amy Harp" },
      ]),
      { verified: 2, correct: 2, accuracyPct: 100 },
    );
  });

  it("reports partial accuracy", () => {
    assert.equal(
      p217ExpectedDmAccuracy([
        { expectedDm: "Mindie Rodriguez", actualMappedDm: "Amy Harp" },
        { expectedDm: "Amy Harp", actualMappedDm: "Amy Harp" },
      ]).accuracyPct,
      50,
    );
  });

  it("handles no verified mappings", () => {
    assert.deepEqual(p217ExpectedDmAccuracy([]), {
      verified: 0,
      correct: 0,
      accuracyPct: 0,
    });
  });
});
