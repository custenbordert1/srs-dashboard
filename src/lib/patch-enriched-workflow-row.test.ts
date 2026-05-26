import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { patchEnrichedRowsFromWorkflow } from "@/lib/patch-enriched-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function sampleCandidate(id: string): BreezyCandidate {
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
  };
}

function workflowRecord(
  candidateId: string,
  status: CandidateWorkflowRecord["workflowStatus"],
): CandidateWorkflowRecord {
  const base = buildBaselineWorkflowRow(sampleCandidate(candidateId));
  return { ...base, candidateId, workflowStatus: status };
}

describe("patchEnrichedRowsFromWorkflow", () => {
  it("returns rows unchanged when enrichment list is empty", () => {
    const workflow = workflowRecord("c-1", "Review");
    assert.deepEqual(patchEnrichedRowsFromWorkflow([], sampleCandidate("c-1"), workflow), []);
  });

  it("updates matching candidate workflow status in enriched rows", () => {
    const breezy = sampleCandidate("c-1");
    const before = buildBaselineWorkflowRow(breezy, workflowRecord("c-1", "Applied"));
    const patched = patchEnrichedRowsFromWorkflow(
      [before],
      breezy,
      workflowRecord("c-1", "Paperwork Sent"),
    );
    assert.equal(patched.length, 1);
    assert.equal(patched[0]?.workflowStatus, "Paperwork Sent");
    assert.notEqual(patched[0], before);
  });

  it("leaves other rows untouched", () => {
    const breezyA = sampleCandidate("c-a");
    const breezyB = sampleCandidate("c-b");
    const rowA = buildBaselineWorkflowRow(breezyA, workflowRecord("c-a", "Applied"));
    const rowB = buildBaselineWorkflowRow(breezyB, workflowRecord("c-b", "Applied"));
    const patched = patchEnrichedRowsFromWorkflow(
      [rowA, rowB],
      breezyA,
      workflowRecord("c-a", "Signed"),
    );
    assert.equal(patched[0]?.workflowStatus, "Signed");
    assert.equal(patched[1]?.workflowStatus, "Applied");
    assert.equal(patched[1], rowB);
  });
});
