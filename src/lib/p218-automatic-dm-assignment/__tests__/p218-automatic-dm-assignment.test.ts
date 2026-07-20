import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertP218LiveAuthorized,
  authorizeP218Mode,
  evaluateP218Assignment,
  executeP218Assignments,
  isP218CandidateArchived,
  isP218Unassigned,
  isP218WorkflowActive,
  parseP218Mode,
  summarizeP218Decisions,
  type P218AssignmentInput,
} from "@/lib/p218-automatic-dm-assignment";

function input(patch: Partial<P218AssignmentInput> = {}): P218AssignmentInput {
  return {
    candidateId: "candidate-1",
    workflowStage: "Paperwork Needed",
    candidateStage: "Applied",
    currentAssignedDm: "Unassigned",
    manuallyAssigned: false,
    positionId: "position-1",
    positionLookupAttempted: true,
    position: {
      positionId: "position-1",
      name: "Retail Merchandiser (Flexible, Project-Based Work)",
      status: "closed",
      city: "Columbus",
      state: "OH",
      zip: "",
      displayLocation: "Columbus, OH",
      locationSource: "location.city+location.state",
    },
    dmCandidates: ["Mindie Rodriguez"],
    ...patch,
  };
}

describe("P218 normalization and activity safety", () => {
  it("recognizes null, empty, and Unassigned DM values", () => {
    assert.equal(isP218Unassigned(null), true);
    assert.equal(isP218Unassigned(""), true);
    assert.equal(isP218Unassigned(" unassigned "), true);
  });

  it("recognizes an existing named DM", () => {
    assert.equal(isP218Unassigned("Amy Harp"), false);
  });

  it("treats normal workflow stages as active", () => {
    assert.equal(isP218WorkflowActive("Applied"), true);
    assert.equal(isP218WorkflowActive("Paperwork Sent"), true);
    assert.equal(isP218WorkflowActive("Signed"), true);
  });

  it("treats terminal workflow stages as inactive", () => {
    assert.equal(isP218WorkflowActive("Not Qualified"), false);
    assert.equal(isP218WorkflowActive("Active Rep"), false);
    assert.equal(isP218WorkflowActive("Loaded in MEL"), false);
  });

  it("detects archived candidate stages case-insensitively", () => {
    assert.equal(isP218CandidateArchived("Archived"), true);
    assert.equal(isP218CandidateArchived("DISQUALIFIED"), true);
    assert.equal(isP218CandidateArchived("withdrawn"), true);
    assert.equal(isP218CandidateArchived("rejected"), true);
    assert.equal(isP218CandidateArchived("Applied"), false);
  });
});

describe("P218 assignment decision safety rules", () => {
  it("never overwrites an existing DM", () => {
    const result = evaluateP218Assignment(
      input({ currentAssignedDm: "Amy Harp" }),
    );
    assert.equal(result.action, "already_assigned");
    assert.equal(result.reason, "already_assigned");
    assert.equal(result.currentAssignedDm, "Amy Harp");
  });

  it("protects a named manual assignment", () => {
    const result = evaluateP218Assignment(
      input({ currentAssignedDm: "Amy Harp", manuallyAssigned: true }),
    );
    assert.equal(result.action, "already_assigned");
    assert.equal(result.reason, "manual_assignment_protected");
  });

  it("protects an explicit manual assignment state even if currently Unassigned", () => {
    const result = evaluateP218Assignment(input({ manuallyAssigned: true }));
    assert.equal(result.action, "unable_to_assign");
    assert.equal(result.reason, "manual_assignment_protected");
  });

  it("rejects inactive workflow candidates", () => {
    const result = evaluateP218Assignment(
      input({ workflowStage: "Not Qualified" }),
    );
    assert.equal(result.reason, "inactive_candidate");
  });

  it("rejects archived candidates", () => {
    const result = evaluateP218Assignment(input({ candidateStage: "Archived" }));
    assert.equal(result.reason, "archived_candidate");
  });

  it("rejects missing applied Position ID", () => {
    const result = evaluateP218Assignment(input({ positionId: "" }));
    assert.equal(result.reason, "position_id_missing");
  });

  it("rejects a position lookup that was not attempted", () => {
    const result = evaluateP218Assignment(
      input({ positionLookupAttempted: false }),
    );
    assert.equal(result.reason, "position_lookup_failed");
  });

  it("rejects a failed position lookup", () => {
    const result = evaluateP218Assignment(input({ position: null }));
    assert.equal(result.reason, "position_lookup_failed");
  });

  it("rejects Position.Location missing city and state", () => {
    const result = evaluateP218Assignment(
      input({
        position: {
          ...input().position!,
          city: "",
          state: "",
          displayLocation: "",
          locationSource: "missing",
        },
      }),
    );
    assert.equal(result.reason, "position_location_missing");
  });

  it("rejects title-derived geography", () => {
    const result = evaluateP218Assignment(
      input({
        position: {
          ...input().position!,
          locationSource: "job_name",
        },
      }),
    );
    assert.equal(result.reason, "position_location_not_authoritative");
  });

  it("rejects incomplete authoritative geography", () => {
    const result = evaluateP218Assignment(
      input({
        position: {
          ...input().position!,
          state: "",
        },
      }),
    );
    assert.equal(result.reason, "territory_unknown");
  });

  it("rejects a territory with no DM mapping", () => {
    const result = evaluateP218Assignment(input({ dmCandidates: [] }));
    assert.equal(result.reason, "dm_lookup_failed");
  });

  it("rejects multiple possible DMs", () => {
    const result = evaluateP218Assignment(
      input({ dmCandidates: ["Amy Harp", "Mindie Rodriguez"] }),
    );
    assert.equal(result.reason, "multiple_dms_possible");
  });

  it("deduplicates an identical DM candidate", () => {
    const result = evaluateP218Assignment(
      input({ dmCandidates: ["Mindie Rodriguez", " Mindie Rodriguez "] }),
    );
    assert.equal(result.action, "would_assign");
    assert.equal(result.expectedAssignedDm, "Mindie Rodriguez");
  });

  it("resolves Columbus OH to Mindie Rodriguez", () => {
    const result = evaluateP218Assignment(input());
    assert.equal(result.action, "would_assign");
    assert.equal(result.reason, "assignable");
    assert.equal(result.expectedAssignedDm, "Mindie Rodriguez");
    assert.deepEqual(result.positionLocation, {
      city: "Columbus",
      state: "OH",
      source: "location.city+location.state",
    });
    assert.equal(result.market, "OH");
    assert.equal(result.territory, "OH");
  });

  it("resolves Kansas City MO to Amy Harp", () => {
    const result = evaluateP218Assignment(
      input({
        position: {
          ...input().position!,
          positionId: "position-2",
          city: "Kansas City",
          state: "MO",
          displayLocation: "Kansas City, MO",
        },
        positionId: "position-2",
        dmCandidates: ["Amy Harp"],
      }),
    );
    assert.equal(result.expectedAssignedDm, "Amy Harp");
    assert.equal(result.territory, "MO");
  });

  it("allows candidates attached to closed positions", () => {
    const result = evaluateP218Assignment(
      input({ position: { ...input().position!, status: "closed" } }),
    );
    assert.equal(result.action, "would_assign");
  });
});

describe("P218 summaries", () => {
  it("counts evaluated, already assigned, assignable, and unable decisions", () => {
    const decisions = [
      evaluateP218Assignment(input()),
      evaluateP218Assignment(input({ currentAssignedDm: "Amy Harp" })),
      evaluateP218Assignment(input({ positionId: "" })),
    ];
    const result = summarizeP218Decisions(decisions);
    assert.equal(result.candidatesEvaluated, 3);
    assert.equal(result.wouldAssign, 1);
    assert.equal(result.alreadyAssigned, 1);
    assert.equal(result.unableToAssign, 1);
  });

  it("initializes zero counts for all reasons", () => {
    const result = summarizeP218Decisions([]);
    assert.equal(result.reasonDistribution.assignable, 0);
    assert.equal(result.reasonDistribution.multiple_dms_possible, 0);
    assert.equal(result.reasonDistribution.concurrent_assignment_detected, 0);
  });
});

describe("P218 mode and explicit live authorization", () => {
  it("defaults to preview mode", () => {
    assert.equal(parseP218Mode([]), "preview");
    assert.equal(authorizeP218Mode([]).approved, true);
  });

  it("keeps explicit --preview in preview mode", () => {
    assert.equal(parseP218Mode(["--preview"]), "preview");
  });

  it("detects --live", () => {
    assert.equal(parseP218Mode(["--live"]), "live");
  });

  it("rejects live mode without either approval signal", () => {
    const result = authorizeP218Mode(["--live"]);
    assert.equal(result.approved, false);
    assert.equal(result.failures.length, 2);
  });

  it("rejects live mode without approved-by identity", () => {
    const result = authorizeP218Mode(["--live", "--operator-approved"]);
    assert.equal(result.approved, false);
    assert.match(result.failures[0]!, /approved-by/);
  });

  it("rejects live mode without operator-approved flag", () => {
    const result = authorizeP218Mode(["--live", "--approved-by=Taylor"]);
    assert.equal(result.approved, false);
    assert.match(result.failures[0]!, /operator-approved/);
  });

  it("accepts inline explicit live approval", () => {
    const result = authorizeP218Mode([
      "--live",
      "--operator-approved",
      "--approved-by=Taylor",
    ]);
    assert.equal(result.approved, true);
    assert.equal(result.approvedBy, "Taylor");
  });

  it("accepts split approved-by argument", () => {
    const result = authorizeP218Mode([
      "--live",
      "--operator-approved",
      "--approved-by",
      "Taylor",
    ]);
    assert.equal(result.approved, true);
    assert.equal(result.approvedBy, "Taylor");
  });

  it("throws when unauthorized live mode is asserted", () => {
    assert.throws(
      () => assertP218LiveAuthorized(authorizeP218Mode(["--live"])),
      /not authorized/,
    );
  });

  it("does not throw for preview mode", () => {
    assert.doesNotThrow(() => assertP218LiveAuthorized(authorizeP218Mode([])));
  });
});

describe("P218 execution", () => {
  it("preview mode performs no persistence", async () => {
    let called = false;
    const decisions = [evaluateP218Assignment(input())];
    const result = await executeP218Assignments({
      decisions,
      authorization: authorizeP218Mode([]),
      persist: async () => {
        called = true;
        return { assigned: true, reason: "assigned" };
      },
    });
    assert.equal(called, false);
    assert.deepEqual(result, decisions);
  });

  it("rejects unauthorized live execution", async () => {
    await assert.rejects(
      executeP218Assignments({
        decisions: [evaluateP218Assignment(input())],
        authorization: authorizeP218Mode(["--live"]),
      }),
      /not authorized/,
    );
  });

  it("requires a persistence adapter in authorized live mode", async () => {
    await assert.rejects(
      executeP218Assignments({
        decisions: [evaluateP218Assignment(input())],
        authorization: authorizeP218Mode([
          "--live",
          "--operator-approved",
          "--approved-by=Taylor",
        ]),
      }),
      /persistence adapter/,
    );
  });

  it("marks a successful live persistence as assigned", async () => {
    const result = await executeP218Assignments({
      decisions: [evaluateP218Assignment(input())],
      authorization: authorizeP218Mode([
        "--live",
        "--operator-approved",
        "--approved-by=Taylor",
      ]),
      persist: async (request) => {
        assert.equal(request.expectedDm, "Mindie Rodriguez");
        assert.equal(request.approvedBy, "Taylor");
        return { assigned: true, reason: "assigned" };
      },
    });
    assert.equal(result[0]!.action, "assigned");
  });

  it("fails closed when a concurrent assignment is detected", async () => {
    const result = await executeP218Assignments({
      decisions: [evaluateP218Assignment(input())],
      authorization: authorizeP218Mode([
        "--live",
        "--operator-approved",
        "--approved-by=Taylor",
      ]),
      persist: async () => ({ assigned: false, reason: "already_assigned" }),
    });
    assert.equal(result[0]!.action, "skipped_race");
    assert.equal(result[0]!.reason, "concurrent_assignment_detected");
  });

  it("never sends already-assigned decisions to persistence", async () => {
    let calls = 0;
    const decision = evaluateP218Assignment(
      input({ currentAssignedDm: "Amy Harp" }),
    );
    const result = await executeP218Assignments({
      decisions: [decision],
      authorization: authorizeP218Mode([
        "--live",
        "--operator-approved",
        "--approved-by=Taylor",
      ]),
      persist: async () => {
        calls += 1;
        return { assigned: true, reason: "assigned" };
      },
    });
    assert.equal(calls, 0);
    assert.deepEqual(result[0], decision);
  });
});

describe("P218 atomic workflow persistence", () => {
  it("assigns only an Unassigned workflow and never overwrites the named DM", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "p218-store-"));
    const previous = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = directory;
    try {
      await writeFile(
        path.join(directory, "candidate-workflows.json"),
        `${JSON.stringify({
          version: 2,
          rosters: {
            recruiters: ["Unassigned", "Recruiting Team"],
            dms: ["Unassigned", "Field Ops"],
          },
          workflows: {
            c1: {
              candidateId: "c1",
              workflowStatus: "Applied",
              notes: [],
              assignedRecruiter: "Unassigned",
              assignedDM: "Unassigned",
              lastActionAt: null,
              nextActionNeeded: "Review",
              history: [],
            },
          },
          updatedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      const { assignCandidateDmIfUnassigned } = await import(
        "@/lib/candidate-workflow-store"
      );
      const first = await assignCandidateDmIfUnassigned({
        candidateId: "c1",
        expectedDm: "Mindie Rodriguez",
        approvedBy: "operator",
        positionId: "p1",
        territory: "OH",
      });
      assert.equal(first.assigned, true);

      const second = await assignCandidateDmIfUnassigned({
        candidateId: "c1",
        expectedDm: "Amy Harp",
        approvedBy: "operator",
        positionId: "p2",
        territory: "MO",
      });
      assert.equal(second.assigned, false);
      assert.equal(second.reason, "already_assigned");

      const persisted = JSON.parse(
        await readFile(path.join(directory, "candidate-workflows.json"), "utf8"),
      );
      assert.equal(persisted.workflows.c1.assignedDM, "Mindie Rodriguez");
      assert.equal(persisted.workflows.c1.workflowStatus, "Applied");
    } finally {
      if (previous === undefined) {
        delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
      } else {
        process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = previous;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
});
