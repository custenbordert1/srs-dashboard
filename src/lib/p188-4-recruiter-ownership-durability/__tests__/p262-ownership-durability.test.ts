import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  compareOwnershipFreshness,
  decideOwnershipWrite,
  formatOwnershipConflictActivity,
  mergeDmOwnershipSticky,
  mergeOwnershipSticky,
  ownershipPrecedenceBand,
  OWNERSHIP_SOURCE_PRIORITY,
} from "@/lib/p188-4-recruiter-ownership-durability";

function wf(partial: Partial<CandidateWorkflowRecord> & { candidateId: string }): CandidateWorkflowRecord {
  return {
    workflowStatus: "Applied",
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    updatedAt: "2026-07-10T00:00:00.000Z",
    lastActionAt: null,
    paperworkStatus: "not_sent",
    recruiterAssignmentSource: null,
    recruiterOwnershipVersion: 0,
    dmOwnershipVersion: 0,
    ...partial,
  } as CandidateWorkflowRecord;
}

describe("P262 ownership durability", () => {
  it("documents authoritative precedence bands", () => {
    assert.ok(OWNERSHIP_SOURCE_PRIORITY.manual > OWNERSHIP_SOURCE_PRIORITY.production_assignment);
    assert.ok(OWNERSHIP_SOURCE_PRIORITY.production_assignment > OWNERSHIP_SOURCE_PRIORITY.breezy_import);
    assert.ok(OWNERSHIP_SOURCE_PRIORITY.breezy_import > OWNERSHIP_SOURCE_PRIORITY.auto);
    assert.ok(OWNERSHIP_SOURCE_PRIORITY.operator_restore > OWNERSHIP_SOURCE_PRIORITY.breezy_import);
    assert.equal(ownershipPrecedenceBand("manual"), "Confirmed operator");
    assert.equal(ownershipPrecedenceBand("breezy_import"), "Breezy-sourced");
    assert.equal(ownershipPrecedenceBand("auto"), "Inferred/default");
  });

  it("confirmed operator write sticks across equal-priority merge race", () => {
    const disk = wf({
      candidateId: "c-race",
      assignedRecruiter: "Recruiting Team",
      recruiterAssignmentSource: "manual",
      recruiterAssignedAt: "2026-07-23T10:00:00.000Z",
      recruiterOwnershipVersion: 2,
      recruiterAssignedBy: "op-a",
      recruiterConfirmationStatus: "confirmed",
    });
    const incoming = wf({
      candidateId: "c-race",
      assignedRecruiter: "P262 Test Recruiter",
      recruiterAssignmentSource: "manual",
      recruiterAssignedAt: "2026-07-23T12:00:00.000Z",
      recruiterOwnershipVersion: 3,
      recruiterAssignedBy: "op-b",
      recruiterConfirmationStatus: "confirmed",
    });
    const merged = mergeOwnershipSticky(disk, incoming);
    assert.equal(merged.assignedRecruiter, "P262 Test Recruiter");
    assert.equal(merged.recruiterAssignedBy, "op-b");
    assert.equal(merged.recruiterConfirmationStatus, "confirmed");
  });

  it("equal-priority stale cannot overwrite newer confirmed write", () => {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Stale Recruiter",
      incomingSource: "manual",
      existingRecruiter: "Confirmed Recruiter",
      existingSource: "manual",
      incomingAssignedAt: "2026-07-23T09:00:00.000Z",
      existingAssignedAt: "2026-07-23T12:00:00.000Z",
      incomingOwnershipVersion: 2,
      existingOwnershipVersion: 4,
    });
    assert.equal(d.applied, false);
    assert.equal(d.blocked, true);
    assert.equal(d.recruiter, "Confirmed Recruiter");
    assert.equal(d.conflictClass, "stale_assignment");
  });

  it("lower-priority never overwrites confirmed operator", () => {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Breezy Owner",
      incomingSource: "breezy_import",
      existingRecruiter: "Operator Owner",
      existingSource: "manual",
      incomingAssignedAt: "2026-07-23T13:00:00.000Z",
      existingAssignedAt: "2026-07-23T10:00:00.000Z",
    });
    assert.equal(d.recruiter, "Operator Owner");
    assert.equal(d.blocked, true);
  });

  it("Unassigned cannot overwrite named ownership", () => {
    const merged = mergeOwnershipSticky(
      wf({
        candidateId: "c-u",
        assignedRecruiter: "Taylor",
        recruiterAssignmentSource: "manual",
        recruiterOwnershipVersion: 1,
      }),
      wf({
        candidateId: "c-u",
        assignedRecruiter: "Unassigned",
        recruiterOwnershipVersion: 0,
      }),
    );
    assert.equal(merged.assignedRecruiter, "Taylor");
  });

  it("DM sticky merge keeps named DM against Unassigned and prefers fresher equal write", () => {
    const disk = wf({
      candidateId: "c-dm",
      assignedDM: "Melissa O'Connor",
      dmAssignmentSource: "manual",
      dmAssignedAt: "2026-07-23T10:00:00.000Z",
      dmAssignedBy: "op-1",
      dmOwnershipVersion: 1,
    });
    const cleared = mergeDmOwnershipSticky(
      disk,
      wf({ candidateId: "c-dm", assignedDM: "Unassigned", dmOwnershipVersion: 0 }),
    );
    assert.equal(cleared.assignedDM, "Melissa O'Connor");

    const newer = mergeDmOwnershipSticky(
      disk,
      wf({
        candidateId: "c-dm",
        assignedDM: "P262 Test DM",
        dmAssignmentSource: "manual",
        dmAssignedAt: "2026-07-23T12:00:00.000Z",
        dmAssignedBy: "op-2",
        dmOwnershipVersion: 2,
      }),
    );
    assert.equal(newer.assignedDM, "P262 Test DM");
    assert.equal(newer.dmAssignedBy, "op-2");
  });

  it("rejected conflict formats auditable Activity without leaking internals", () => {
    const message = formatOwnershipConflictActivity({
      attemptedRecruiter: "Alex",
      attemptedSource: "auto",
      existingRecruiter: "Taylor",
      existingSource: "manual",
      attemptedAt: "2026-07-23T11:00:00.000Z",
      existingAt: "2026-07-23T12:00:00.000Z",
      reason: "Equal-priority stale auto cannot overwrite newer confirmed write",
    });
    assert.match(message, /Confirmed operator/);
    assert.match(message, /Taylor/);
    assert.match(message, /Alex/);
    assert.doesNotMatch(message, /node:fs|stack|\/Users\//i);
  });

  it("compareOwnershipFreshness prefers version then timestamp", () => {
    assert.equal(
      compareOwnershipFreshness({
        incomingOwnershipVersion: 5,
        existingOwnershipVersion: 4,
      }),
      1,
    );
    assert.equal(
      compareOwnershipFreshness({
        incomingOwnershipVersion: 3,
        existingOwnershipVersion: 3,
        incomingAssignedAt: "2026-07-23T12:00:00.000Z",
        existingAssignedAt: "2026-07-23T11:00:00.000Z",
      }),
      1,
    );
    assert.equal(
      compareOwnershipFreshness({
        incomingOwnershipVersion: 3,
        existingOwnershipVersion: 3,
        incomingAssignedAt: "2026-07-23T10:00:00.000Z",
        existingAssignedAt: "2026-07-23T11:00:00.000Z",
      }),
      -1,
    );
  });

  it("merge records Activity entry when equal-priority stale is rejected", () => {
    const merged = mergeOwnershipSticky(
      wf({
        candidateId: "c-act",
        assignedRecruiter: "Confirmed",
        recruiterAssignmentSource: "manual",
        recruiterAssignedAt: "2026-07-23T12:00:00.000Z",
        recruiterOwnershipVersion: 4,
      }),
      wf({
        candidateId: "c-act",
        assignedRecruiter: "Stale",
        recruiterAssignmentSource: "manual",
        recruiterAssignedAt: "2026-07-23T09:00:00.000Z",
        recruiterOwnershipVersion: 2,
        history: [],
      }),
    );
    assert.equal(merged.assignedRecruiter, "Confirmed");
    assert.ok(merged.history.some((e) => /Ownership conflict/.test(e.message)));
  });

  it("client modules must not import node:fs/promises", () => {
    const require = createRequire(import.meta.url);
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const root = path.resolve(process.cwd(), "src/components/recruiting");
    const targets = [
      "candidate-assignment-badge.tsx",
      "candidate-operations-applicant-drawer.tsx",
      "hiring-workspace-applicant-drawer.tsx",
      "job-command-center-panel.tsx",
    ];
    for (const file of targets) {
      const full = path.join(root, file);
      const text = fs.readFileSync(full, "utf8");
      assert.doesNotMatch(text, /node:fs\/promises/);
      assert.doesNotMatch(text, /from ["']fs\/promises["']/);
    }
  });
});
