import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { decideOwnershipWrite } from "@/lib/p188-4-recruiter-ownership-durability/precedence";
import { isDemoRecruiterName } from "@/lib/production-recruiter-directory";
import {
  normalizeDemoRecruiterAtIngestionBoundary,
  scrubDemoOwnershipSignals,
  shouldRejectDemoOverwrite,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/prevent";
import {
  buildDemoOwnershipAudit,
  proposeDemoOwnershipCleanup,
  selectAutomaticRepairBatch,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/select";
import { executeP2032DemoOwnershipCleanup } from "@/lib/p203-2-demo-recruiter-ownership-cleanup/execute";
import { OwnershipConcurrencyError, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";

function wf(
  partial: Partial<CandidateWorkflowRecord> & { candidateId: string },
): CandidateWorkflowRecord {
  return {
    candidateId: partial.candidateId,
    workflowStatus: "Applied",
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    updatedAt: "2026-07-15T00:00:00.000Z",
    lastActionAt: null,
    paperworkStatus: "not_sent",
    recruiterAssignmentSource: "auto",
    recruiterOwnershipVersion: 1,
    ...partial,
  } as CandidateWorkflowRecord;
}

describe("P203.2 demo recruiter ownership cleanup", () => {
  it("detects demo recruiter names", () => {
    assert.equal(isDemoRecruiterName("Alex"), true);
    assert.equal(isDemoRecruiterName("Taylor"), false);
    assert.equal(isDemoRecruiterName("Recruiting Team"), false);
  });

  it("normalizes demo names at ingestion boundary and preserves evidence", () => {
    const result = normalizeDemoRecruiterAtIngestionBoundary("Jordan");
    assert.equal(result.normalizedToUnassigned, true);
    assert.equal(result.appliedRecruiter, "Unassigned");
    assert.equal(result.evidencePreserved, "Jordan");
  });

  it("scrubs demo preferred ownership signals", () => {
    const scrubbed = scrubDemoOwnershipSignals({
      ownerName: "Alex",
      assigneeName: null,
      recruiterName: null,
      preferredName: "Alex",
      sourcedAt: "2026-07-15T00:00:00.000Z",
    });
    assert.equal(scrubbed?.preferredName, null);
    assert.equal(scrubbed?.ownerName, "Alex");
  });

  it("rejects demo overwrite of valid production owners (stale snapshot protection)", () => {
    assert.equal(
      shouldRejectDemoOverwrite({ existingRecruiter: "Taylor", incomingRecruiter: "Alex" }),
      true,
    );
    const d = decideOwnershipWrite({
      existingRecruiter: "Taylor",
      existingSource: "manual",
      incomingRecruiter: "Alex",
      incomingSource: "breezy_import",
    });
    assert.equal(d.recruiter, "Taylor");
    assert.equal(d.blocked, true);
  });

  it("allows valid audit-based restoration classification", () => {
    const workflows = {
      c1: wf({ candidateId: "c1", assignedRecruiter: "Alex", workflowStatus: "Applied" }),
    };
    const { preview } = proposeDemoOwnershipCleanup({
      workflows,
      rosterRecruiters: ["Unassigned", "Taylor", "Recruiting Team"],
      manualEvidence: {
        c1: {
          recruiter: "Taylor",
          at: "2026-07-01T00:00:00.000Z",
          source: "manual_audit",
          detail: "manual → Taylor",
        },
      },
      productionAutoEvidence: {},
      ledgerByCandidate: {},
      p158Events: [],
    });
    assert.equal(preview.length, 1);
    assert.equal(preview[0]!.proposedReplacement, "Taylor");
    assert.equal(preview[0]!.classification, "safe_automatic_repair");
    assert.equal(preview[0]!.replacementSource, "manual_audit");
  });

  it("uses recruiting-team policy fallback instead of mass Taylor routing", () => {
    const workflows = {
      c2: wf({
        candidateId: "c2",
        assignedRecruiter: "Casey",
        workflowStatus: "Needs Review",
      }),
    };
    const { preview } = proposeDemoOwnershipCleanup({
      workflows,
      ingestionCandidates: [
        {
          candidateId: "c2",
          firstName: "Pat",
          lastName: "Lee",
          email: "p@example.com",
          phone: "",
          source: "Indeed",
          stage: "applied",
          appliedDate: "2026-07-10",
          createdDate: "2026-07-10",
          addedDate: "2026-07-10",
          updatedDate: "2026-07-10",
          addedDateSource: "creation_date",
          positionId: "p1",
          positionName: "Merchandiser",
          city: "Columbus",
          state: "OH",
          zipCode: "43004",
          resumeText: "",
        },
      ],
      rosterRecruiters: ["Unassigned", "Taylor", "Recruiting Team"],
      manualEvidence: {},
      productionAutoEvidence: {},
      ledgerByCandidate: {},
      p158Events: [],
    });
    assert.equal(preview[0]!.proposedReplacement, "Recruiting Team");
    assert.equal(preview[0]!.replacementSource, "recruiting_team_policy");
    assert.notEqual(preview[0]!.proposedReplacement, "Taylor");
  });

  it("refuses conflicting evidence", () => {
    const workflows = {
      c3: wf({ candidateId: "c3", assignedRecruiter: "Drew" }),
    };
    const { preview } = proposeDemoOwnershipCleanup({
      workflows,
      rosterRecruiters: ["Unassigned", "Taylor", "Recruiting Team"],
      manualEvidence: {
        c3: {
          recruiter: "Taylor",
          at: "2026-07-02T00:00:00.000Z",
          source: "manual_audit",
          detail: "manual Taylor",
        },
      },
      productionAutoEvidence: {
        c3: {
          recruiter: "Recruiting Team",
          at: "2026-07-03T00:00:00.000Z",
          source: "production_auto_audit",
          detail: "auto RT",
        },
      },
      ledgerByCandidate: {},
      p158Events: [],
    });
    assert.equal(preview[0]!.classification, "conflicting_evidence");
    assert.equal(preview[0]!.proposedReplacement, null);
    assert.equal(preview[0]!.operatorReviewRequired, true);
  });

  it("caps automatic batch at 100", () => {
    const workflows: Record<string, CandidateWorkflowRecord> = {};
    for (let i = 0; i < 120; i += 1) {
      workflows[`c-${i}`] = wf({
        candidateId: `c-${i}`,
        assignedRecruiter: "Logan",
        workflowStatus: "Applied",
      });
    }
    const { preview } = proposeDemoOwnershipCleanup({
      workflows,
      rosterRecruiters: ["Unassigned", "Taylor", "Recruiting Team"],
      manualEvidence: {},
      productionAutoEvidence: {},
      ledgerByCandidate: {},
      p158Events: [],
    });
    const batch = selectAutomaticRepairBatch(preview, 100);
    assert.equal(batch.length, 100);
  });

  it("audits demo ownership counts", () => {
    const audit = buildDemoOwnershipAudit({
      workflows: {
        a: wf({ candidateId: "a", assignedRecruiter: "Alex" }),
        b: wf({ candidateId: "b", assignedRecruiter: "Taylor" }),
        c: wf({ candidateId: "c", assignedRecruiter: "Riley" }),
      },
      rosterRecruiters: ["Unassigned", "Taylor", "Recruiting Team"],
    });
    assert.equal(audit.demoOwnedWorkflows, 2);
    assert.equal(audit.byDemoRecruiter.Alex, 1);
    assert.equal(audit.byDemoRecruiter.Riley, 1);
    assert.equal(audit.selectorDemoNames, 0);
  });

  it("integration: production directory never lists demos", () => {
    const audit = buildDemoOwnershipAudit({
      workflows: {},
      rosterRecruiters: ["Alex", "Taylor", "Unassigned", "Recruiting Team"],
    });
    assert.equal(audit.selectorDemoNames, 0);
  });
});

describe("P203.2 ownership write semantics", () => {
  it("valid production replaces demo without lifecycle fields in decision path", () => {
    const d = decideOwnershipWrite({
      existingRecruiter: "Morgan",
      existingSource: "auto",
      incomingRecruiter: "Recruiting Team",
      incomingSource: "operator_restore",
    });
    assert.equal(d.applied, true);
    assert.equal(d.recruiter, "Recruiting Team");
  });

  it("idempotent cleanup skips already-clean records", async () => {
    const result = await executeP2032DemoOwnershipCleanup({
      batch: [
        {
          candidateId: "__p2032_missing__",
          redactedCandidateId: "redacted",
          currentDemoOwner: "Alex",
          proposedReplacement: "Recruiting Team",
          replacementEvidence: "test",
          replacementSource: "recruiting_team_policy",
          confidence: "medium",
          workflowVersion: 0,
          expectedOwnershipVersion: 0,
          expectedRecruiter: "Alex",
          candidateStatus: "Applied",
          paperworkStatus: "not_sent",
          statusBuckets: ["active", "workflow"],
          classification: "safe_automatic_repair",
          operatorReviewRequired: false,
          idempotencyKey: "test-key",
        },
      ],
      authorization: {
        actor: "p203.2-test",
        authorizedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        fingerprint: "test-fp",
        maxBatch: 100,
        allowProductionWrites: true,
      },
    });
    assert.equal(result.attempted, 1);
    assert.equal(result.repaired, 0);
    assert.equal(result.lifecycleChanges, 0);
    assert.equal(result.paperworkChanges, 0);
  });

  it("optimistic concurrency surfaces OwnershipConcurrencyError shape", () => {
    assert.equal(typeof OwnershipConcurrencyError, "function");
    assert.equal(typeof upsertCandidateWorkflow, "function");
  });
});
