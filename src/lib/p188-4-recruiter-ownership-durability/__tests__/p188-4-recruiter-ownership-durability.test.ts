import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractBreezyOwnershipSignalsFromRaw } from "@/lib/breezy-api";
import { resolveAssignedRecruiter } from "@/lib/workflow-onboarding-reconciliation/workflow-durability";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  assertOwnershipCas,
  decideOwnershipWrite,
  executeOwnershipRestoreBatch,
  mergeOwnershipSticky,
  packageRestoreCanary,
  resetP1884LedgerMemoryForTests,
  appendOwnershipLedgerEvent,
  listP1884LedgerMemoryForTests,
  simulateOwnershipDurability,
  type P1884RestorePreviewItem,
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
    ...partial,
  } as CandidateWorkflowRecord;
}

describe("P188.4 recruiter ownership durability", () => {
  it("sanitizeCandidate / extract preserves Breezy ownership signals", () => {
    const signals = extractBreezyOwnershipSignalsFromRaw({
      owner: { name: "Taylor" },
      assigned_to: { name: "Alex" },
      recruiter: { name: "Riley" },
    });
    assert.equal(signals.ownerName, "Taylor");
    assert.equal(signals.assigneeName, "Alex");
    assert.equal(signals.recruiterName, "Riley");
    assert.equal(signals.preferredName, "Taylor");
  });

  it("Unassigned and null cannot overwrite named recruiter", () => {
    const existing = wf({ candidateId: "c1", assignedRecruiter: "Taylor", recruiterAssignmentSource: "auto" });
    assert.equal(resolveAssignedRecruiter("Unassigned", existing), "Taylor");
    assert.equal(resolveAssignedRecruiter(undefined, existing), "Taylor");
    assert.equal(resolveAssignedRecruiter("", existing), "Taylor");
    const d = decideOwnershipWrite({
      incomingRecruiter: null,
      existingRecruiter: "Taylor",
      existingSource: "auto",
    });
    assert.equal(d.recruiter, "Taylor");
    assert.equal(d.blocked, true);
  });

  it("lower-priority source cannot overwrite higher-priority source", () => {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Alex",
      incomingSource: "auto",
      existingRecruiter: "Taylor",
      existingSource: "manual",
    });
    assert.equal(d.recruiter, "Taylor");
    assert.equal(d.blocked, true);
  });

  it("explicit reassignment works with force", () => {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Jordan",
      incomingSource: "manual",
      existingRecruiter: "Taylor",
      existingSource: "auto",
      allowForceOverwrite: true,
    });
    assert.equal(d.applied, true);
    assert.equal(d.recruiter, "Jordan");
  });

  it("optimistic concurrency conflict fails closed", () => {
    const existing = wf({ candidateId: "c", recruiterOwnershipVersion: 3, assignedRecruiter: "Taylor" });
    const cas = assertOwnershipCas({
      existing,
      expectedOwnershipVersion: 2,
      expectedRecruiter: "Taylor",
    });
    assert.equal(cas.ok, false);
  });

  it("ingestion/assignment race merge preserves named ownership", () => {
    const disk = wf({
      candidateId: "c",
      assignedRecruiter: "Morgan",
      recruiterAssignmentSource: "auto",
      recruiterOwnershipVersion: 2,
    });
    const incoming = wf({
      candidateId: "c",
      assignedRecruiter: "Unassigned",
      recruiterOwnershipVersion: 0,
    });
    const merged = mergeOwnershipSticky(disk, incoming);
    assert.equal(merged.assignedRecruiter, "Morgan");
  });

  it("ownership ledger appends idempotently", async () => {
    resetP1884LedgerMemoryForTests();
    const a = await appendOwnershipLedgerEvent({
      candidateId: "c-ledger",
      previousRecruiter: "Unassigned",
      newRecruiter: "Taylor",
      source: "operator_restore",
      actor: "op",
      actorRole: "operator",
      reason: "test",
      correlationId: "corr-1",
      idempotencyKey: "idem-1",
      workflowVersion: 1,
      confidence: 100,
      evidenceReference: "test",
      rollbackReference: null,
    });
    const b = await appendOwnershipLedgerEvent({
      candidateId: "c-ledger",
      previousRecruiter: "Unassigned",
      newRecruiter: "Taylor",
      source: "operator_restore",
      actor: "op",
      actorRole: "operator",
      reason: "test",
      correlationId: "corr-1",
      idempotencyKey: "idem-1",
      workflowVersion: 1,
      confidence: 100,
      evidenceReference: "test",
      rollbackReference: null,
    });
    assert.equal(a.id, b.id);
    assert.equal(listP1884LedgerMemoryForTests().filter((e) => e.idempotencyKey === "idem-1").length, 1);
  });

  it("manual and operator restore are sticky against Unassigned", () => {
    for (const source of ["manual", "operator_restore"] as const) {
      const d = decideOwnershipWrite({
        incomingRecruiter: "Unassigned",
        existingRecruiter: "Sam",
        existingSource: source,
      });
      assert.equal(d.recruiter, "Sam");
    }
  });

  it("conflicting equal-priority history creates protected conflict", () => {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Alex",
      incomingSource: "auto",
      existingRecruiter: "Taylor",
      existingSource: "auto",
    });
    assert.equal(d.conflictClass, "conflicting_history");
    assert.equal(d.applied, false);
  });

  it("stale restore and canary package preview", () => {
    const items: P1884RestorePreviewItem[] = [
      {
        candidateId: "a1",
        redactedCandidateId: "a…1",
        currentRecruiter: "Unassigned",
        proposedRecruiter: "Taylor",
        lastNamedAt: "2026-07-01T00:00:00.000Z",
        sourceEvent: "auto_assign_recruiter",
        assignmentHistorySummary: "x",
        confidence: "medium",
        jobResolved: true,
        workflowState: "Applied",
        bypass: false,
        classification: "confirmed_restore",
        recommendationReadinessImpact: "may ready",
      },
      {
        candidateId: "bypass",
        redactedCandidateId: "b…s",
        currentRecruiter: "Unassigned",
        proposedRecruiter: "Alex",
        lastNamedAt: null,
        sourceEvent: null,
        assignmentHistorySummary: "x",
        confidence: "medium",
        jobResolved: true,
        workflowState: "Paperwork Sent",
        bypass: true,
        classification: "confirmed_restore",
        recommendationReadinessImpact: "none",
      },
    ];
    const canary = packageRestoreCanary(items, 10);
    assert.equal(canary.length, 1);
    assert.equal(canary[0].candidateId, "a1");
  });

  it("restore batch defaults to preview-only with no side effects", async () => {
    const refused = await executeOwnershipRestoreBatch({
      candidates: [{ candidateId: "x", proposedRecruiter: "Taylor" }],
      actor: "test",
      actorRole: "operator",
      reason: "should not write",
      allowProductionWrites: false,
    });
    assert.equal(refused.executed, false);
    assert.equal(refused.previewOnly, true);
    assert.equal(refused.lifecycleWrites, 0);
    assert.equal(refused.recommendations, 0);
    assert.equal(refused.approvals, 0);
    assert.equal(refused.paperworkSends, 0);
    assert.equal(refused.melWrites, 0);
  });

  it("durability simulation covers clobber prevention", () => {
    const sim = simulateOwnershipDurability();
    assert.ok(sim.clobbersPrevented >= 3);
    assert.ok(sim.scenarios.every((s) => s.ok));
  });
});
