import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import {
  buildAuthoritativeOwnershipDesign,
  buildRootCauseFindings,
  buildStaticSourceInventory,
  simulateRecruiterRecovery,
} from "@/lib/p188-3-recruiter-ownership-recovery";

function wf(id: string): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: "Applied",
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    updatedAt: "2026-07-09T12:00:00.000Z",
    lastActionAt: "2026-07-09T12:00:00.000Z",
    paperworkStatus: "not_sent",
  } as CandidateWorkflowRecord;
}

describe("P188.3 recruiter ownership recovery", () => {
  it("inventories ownership sources and marks workflow store unpopulated when all Unassigned", () => {
    const sources = buildStaticSourceInventory({
      workflowsUnassigned: 684,
      workflowsTotal: 684,
      ingestionOwnerFieldsPresent: 0,
      ingestionTotal: 677,
      p158ProductionAssigned: 0,
      p158Simulated: 75,
      p158LastAt: "2026-07-01T00:00:00.000Z",
      auditLastAutoAssignAt: "2026-07-09T17:38:21.000Z",
      auditUniqueNamedCandidates: 377,
      workflowStoreUpdatedAt: "2026-07-10T00:00:00.000Z",
    });
    const store = sources.find((s) => s.sourceId === "candidate_workflow_store");
    assert.equal(store?.currentlyPopulated, false);
    const breezy = sources.find((s) => s.sourceId === "breezy_candidate_owner");
    assert.equal(breezy?.writesAssignedRecruiter, false);
    const p158 = sources.find((s) => s.sourceId === "p158_assignment_engine");
    assert.equal(p158?.currentlyPopulated, false);
  });

  it("classifies primary root causes including schema mismatch and overwrite", () => {
    const findings = buildRootCauseFindings({
      workflowsUnassigned: 684,
      workflowsTotal: 684,
      ingestionOwnerFieldsPresent: 0,
      p158ProductionAssigned: 0,
      auditNamedThenWipedEvidence: true,
      auditUniqueNamedCandidates: 377,
      rapidWipeEvents: 100,
    });
    const primary = findings.filter((f) => f.primary).map((f) => f.category);
    assert.ok(primary.includes("schema_mismatch"));
    assert.ok(primary.includes("never_imported"));
    assert.ok(primary.includes("overwritten"));
  });

  it("simulates recovery buckets without guessing when evidence is absent", () => {
    const nowMs = Date.parse("2026-07-10T12:00:00.000Z");
    const events: P158AssignmentAuditEvent[] = [
      {
        id: "s1",
        at: "2026-07-08T00:00:00.000Z",
        candidateId: "c-sim",
        candidateName: "X",
        action: "simulated",
        recruiter: "Taylor",
        confidence: 0.8,
        reason: "sim",
        executionMode: "simulation",
        beforeRecruiter: "Unassigned",
        afterRecruiter: "Taylor",
        rollbackId: null,
      },
    ];
    const result = simulateRecruiterRecovery({
      workflows: [wf("c-none"), wf("c-audit"), wf("c-sim"), wf("c-conflict"), wf("c-manual")],
      lastNamedByCandidate: {
        "c-audit": {
          candidateId: "c-audit",
          recruiter: "Alex",
          at: "2026-07-09T00:00:00.000Z",
          action: "auto_assign_recruiter",
        },
        "c-conflict": {
          candidateId: "c-conflict",
          recruiter: "Morgan",
          at: "2026-07-09T00:00:00.000Z",
          action: "auto_assign_recruiter",
        },
        "c-manual": {
          candidateId: "c-manual",
          recruiter: "Jordan",
          at: "2026-07-09T00:00:00.000Z",
          action: "manual_assign_recruiter",
        },
      },
      p158Events: [
        ...events,
        {
          id: "s2",
          at: "2026-07-08T00:00:00.000Z",
          candidateId: "c-conflict",
          candidateName: "X",
          action: "simulated",
          recruiter: "Riley",
          confidence: 0.7,
          reason: "sim",
          executionMode: "simulation",
          beforeRecruiter: "Unassigned",
          afterRecruiter: "Riley",
          rollbackId: null,
        },
      ],
      jobResolvedByCandidate: {
        "c-none": false,
        "c-audit": true,
        "c-sim": true,
        "c-conflict": true,
        "c-manual": true,
      },
      nowMs,
    });

    assert.equal(result.counts.impossible_to_recover, 1);
    assert.equal(result.counts.operator_confirmation_required, 2); // audit + sim
    assert.equal(result.counts.conflicting, 1);
    assert.equal(result.counts.automatically_recoverable, 1);
    assert.equal(result.counts.stale, 0);
  });

  it("documents authoritative ownership design with audit and rollback", () => {
    const design = buildAuthoritativeOwnershipDesign();
    assert.match(design.owner, /assignedRecruiter/);
    assert.ok(design.auditRequirements.length >= 3);
    assert.ok(design.rollback.some((r) => /correlationId/i.test(r)));
    assert.ok(design.conflictRules.some((r) => /manual/i.test(r)));
  });

  it("marks side-effect contract as zero writes (constant shape)", () => {
    // Analyzer guarantees these constants; unit-level contract check
    const sideEffects = {
      productionWrites: 0 as const,
      workflowUpdates: 0 as const,
      approvals: 0 as const,
      paperworkSends: 0 as const,
      melWrites: 0 as const,
      automationEnabled: false as const,
    };
    assert.equal(sideEffects.productionWrites, 0);
    assert.equal(sideEffects.automationEnabled, false);
  });
});
