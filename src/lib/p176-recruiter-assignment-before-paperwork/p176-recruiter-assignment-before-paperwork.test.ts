import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlockedOnlyByUnassignedRecruiter,
  passesP176AssignmentGates,
} from "@/lib/p176-recruiter-assignment-before-paperwork/evaluate-assignment-eligibility";

describe("P176 recruiter assignment before paperwork", () => {
  it("detects unassigned-recruiter-only P152 block", () => {
    assert.equal(
      isBlockedOnlyByUnassignedRecruiter({
        blocked: true,
        blockers: ["Recruiter not assigned."],
        primaryHardBlocker: "unassigned_recruiter",
      }),
      true,
    );
    assert.equal(
      isBlockedOnlyByUnassignedRecruiter({
        blocked: true,
        blockers: ["Duplicate candidate flagged."],
        primaryHardBlocker: "duplicate_candidate",
      }),
      false,
    );
  });

  it("rejects duplicate P157 actions", () => {
    const result = passesP176AssignmentGates({
      row: {
        candidateId: "abc",
        email: "a@example.com",
        assignedRecruiter: "Unassigned",
        workflowStatus: "Applied",
        stage: "Applied",
        notes: [],
        candidateGrade: { gradeContributors: [] },
      } as never,
      candidate: {
        candidateId: "abc",
        email: "a@example.com",
        firstName: "A",
        lastName: "B",
        stage: "Applied",
      } as never,
      onboarding: null,
      p157: {
        action: "Candidate Duplicate",
      } as never,
      p152: {
        blocked: true,
        blockers: ["Recruiter not assigned."],
        primaryHardBlocker: "unassigned_recruiter",
      },
    });
    assert.equal(result.eligible, false);
    assert.ok(result.reasons.some((r) => r.includes("Candidate Duplicate")));
  });
});
