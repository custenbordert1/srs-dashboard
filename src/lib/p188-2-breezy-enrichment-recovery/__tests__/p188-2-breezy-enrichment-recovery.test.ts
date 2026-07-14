import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import {
  buildEnrichmentBundle,
  extractBreezyAssignee,
  indexExecutedAssignmentAudits,
  isEvidenceStale,
  refuseProductionEnrichmentWrite,
  resolveJobEnrichment,
  resolveRecruiterEnrichment,
  runP1882EnrichmentPipeline,
} from "@/lib/p188-2-breezy-enrichment-recovery";

const NOW = Date.parse("2026-07-10T12:00:00.000Z");

function wf(
  partial: Partial<CandidateWorkflowRecord> & { candidateId: string },
): CandidateWorkflowRecord {
  return {
    candidateId: partial.candidateId,
    workflowStatus: partial.workflowStatus ?? "Applied",
    assignedRecruiter: partial.assignedRecruiter ?? "Unassigned",
    assignedDM: partial.assignedDM ?? "Unassigned",
    notes: partial.notes ?? [],
    history: partial.history ?? [],
    updatedAt: partial.updatedAt ?? "2026-07-09T12:00:00.000Z",
    lastActionAt: partial.lastActionAt ?? "2026-07-09T12:00:00.000Z",
    paperworkStatus: partial.paperworkStatus ?? "not_sent",
    recommendedStage: partial.recommendedStage ?? null,
    progressionReason: partial.progressionReason ?? null,
    recruiterAssignmentSource: partial.recruiterAssignmentSource,
    ...partial,
  } as CandidateWorkflowRecord;
}

function breezy(
  partial: Partial<BreezyCandidate> & { candidateId: string },
): BreezyCandidate {
  return {
    candidateId: partial.candidateId,
    firstName: "A",
    lastName: "B",
    email: "a@b.com",
    phone: null,
    source: "breezy",
    stage: "applied",
    appliedDate: "2026-07-01",
    createdDate: "2026-07-01",
    addedDate: "2026-07-01",
    updatedDate: partial.updatedDate ?? "2026-07-01T00:00:00.000Z",
    addedDateSource: "test",
    positionId: partial.positionId ?? "",
    positionName: partial.positionName ?? "",
    city: partial.city ?? "",
    state: partial.state ?? "",
    zipCode: null,
    resumeText: null,
    hasResume: false,
    ...partial,
  } as BreezyCandidate;
}

describe("P188.2 breezy enrichment recovery", () => {
  it("resolves recruiter from Breezy assignee", () => {
    const candidate = breezy({
      candidateId: "c1",
      updatedDate: "2026-07-05T00:00:00.000Z",
    });
    (candidate as unknown as { owner: { name: string } }).owner = { name: "Taylor" };
    assert.equal(extractBreezyAssignee(candidate), "Taylor");

    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "c1" })],
      breezyCandidates: [candidate],
      nowMs: NOW,
    });
    const result = resolveRecruiterEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, true);
    assert.equal(result.recruiter, "Taylor");
    assert.equal(result.source, "breezy_assignee");
  });

  it("uses executed assignment audit when it is the sole authoritative signal", () => {
    const audits: P158AssignmentAuditEvent[] = [
      {
        id: "a1",
        at: "2026-07-08T00:00:00.000Z",
        candidateId: "c2",
        candidateName: "X",
        action: "assigned",
        recruiter: "AuditRecruiter",
        confidence: 0.9,
        reason: "production assign",
        executionMode: "production",
        beforeRecruiter: "Unassigned",
        afterRecruiter: "AuditRecruiter",
        rollbackId: null,
      },
    ];
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "c2" })],
      breezyCandidates: [breezy({ candidateId: "c2" })],
      assignmentAudits: audits,
      nowMs: NOW,
    });
    const result = resolveRecruiterEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, true);
    assert.equal(result.recruiter, "AuditRecruiter");
    assert.equal(result.source, "assignment_audit");
  });

  it("refuses when assignment audit conflicts with Breezy assignee", () => {
    const candidate = breezy({ candidateId: "c2b" });
    (candidate as unknown as { owner: { name: string } }).owner = { name: "BreezyOwner" };
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "c2b" })],
      breezyCandidates: [candidate],
      assignmentAudits: [
        {
          id: "a1",
          at: "2026-07-08T00:00:00.000Z",
          candidateId: "c2b",
          candidateName: "X",
          action: "assigned",
          recruiter: "AuditRecruiter",
          confidence: 0.9,
          reason: "production assign",
          executionMode: "production",
          beforeRecruiter: "Unassigned",
          afterRecruiter: "AuditRecruiter",
          rollbackId: null,
        },
      ],
      nowMs: NOW,
    });
    const result = resolveRecruiterEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, false);
    assert.equal(result.conflicting, true);
  });

  it("uses unique territory fallback when higher signals absent", () => {
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "c3" })],
      breezyCandidates: [breezy({ candidateId: "c3", state: "TX" })],
      territoryRecruiterUnique: { TX: "TerritoryRecruiter" },
      nowMs: NOW,
    });
    const result = resolveRecruiterEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, true);
    assert.equal(result.recruiter, "TerritoryRecruiter");
    assert.equal(result.source, "territory_dm");
  });

  it("refuses ambiguous conflicting recruiter evidence", () => {
    const candidate = breezy({ candidateId: "c4" });
    (candidate as unknown as { owner: { name: string } }).owner = { name: "Alice" };
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "c4", assignedRecruiter: "Bob" })],
      breezyCandidates: [candidate],
      nowMs: NOW,
    });
    const result = resolveRecruiterEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, false);
    assert.equal(result.ambiguous, true);
    assert.equal(result.conflicting, true);
    assert.ok(result.alternateCandidates.includes("Alice"));
    assert.ok(result.alternateCandidates.includes("Bob"));
  });

  it("resolves job by exact position ID", () => {
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "j1" })],
      breezyCandidates: [
        breezy({
          candidateId: "j1",
          positionId: "pos-exact",
          positionName: "Merchandiser",
          city: "Ames",
          state: "IA",
        }),
      ],
      nowMs: NOW,
    });
    const result = resolveJobEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, true);
    assert.equal(result.jobId, "pos-exact");
    assert.equal(result.source, "breezy_position_id");
  });

  it("resolves job by friendly ID", () => {
    const c = breezy({
      candidateId: "j2",
      positionId: "",
      positionName: "Other",
    });
    (c as unknown as { meta: { friendlyId: string } }).meta = { friendlyId: "FRIENDLY-9" };
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "j2" })],
      breezyCandidates: [c],
      breezyJobs: [
        {
          jobId: "job-friendly",
          name: "Friendly Job",
          city: "Dallas",
          state: "TX",
          friendlyId: "FRIENDLY-9",
        } as never,
      ],
      nowMs: NOW,
    });
    // Ensure catalog has friendly
    assert.ok(bundle.jobsCatalog.some((j) => j.friendlyId === "FRIENDLY-9"));
    const result = resolveJobEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, true);
    assert.equal(result.jobId, "job-friendly");
    assert.equal(result.source, "friendly_id");
  });

  it("resolves job via ingestion alias", () => {
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "j3" })],
      breezyCandidates: [
        breezy({
          candidateId: "j3",
          positionId: "",
          positionName: "ALIAS-CODE",
          city: "X",
          state: "Y",
        }),
      ],
      breezyJobs: [
        {
          jobId: "job-alias",
          name: "Real Title",
          city: "X",
          state: "Y",
          friendlyId: "ALIAS-CODE",
        } as never,
      ],
      nowMs: NOW,
    });
    const result = resolveJobEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, true);
    assert.equal(result.source, "ingestion_alias");
    assert.equal(result.jobId, "job-alias");
  });

  it("resolves unique title+city+state and refuses ambiguous title matches", () => {
    const uniqueBundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "j4" })],
      breezyCandidates: [
        breezy({
          candidateId: "j4",
          positionId: "",
          positionName: "Specialist",
          city: "Ames",
          state: "IA",
        }),
        breezy({
          candidateId: "other",
          positionId: "only-one",
          positionName: "Specialist",
          city: "Ames",
          state: "IA",
        }),
      ],
      nowMs: NOW,
    });
    const unique = resolveJobEnrichment(uniqueBundle.workflows[0], uniqueBundle, NOW);
    assert.equal(unique.resolved, true);
    assert.equal(unique.source, "unique_title_city_state");

    const ambBundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "j5" })],
      breezyCandidates: [
        breezy({
          candidateId: "j5",
          positionId: "",
          positionName: "Clerk",
          city: "Ames",
          state: "IA",
        }),
      ],
      breezyJobs: [
        {
          jobId: "a",
          name: "Clerk",
          city: "Ames",
          state: "IA",
        } as never,
        {
          jobId: "b",
          name: "Clerk",
          city: "Ames",
          state: "IA",
        } as never,
      ],
      nowMs: NOW,
    });
    const amb = resolveJobEnrichment(ambBundle.workflows[0], ambBundle, NOW);
    assert.equal(amb.resolved, false);
    assert.equal(amb.ambiguous, true);
  });

  it("rejects stale assignment audit evidence", () => {
    const indexed = indexExecutedAssignmentAudits(
      [
        {
          id: "old",
          at: "2025-01-01T00:00:00.000Z",
          candidateId: "c-stale",
          candidateName: "X",
          action: "assigned",
          recruiter: "OldRec",
          confidence: 1,
          reason: "old",
          executionMode: "production",
          beforeRecruiter: null,
          afterRecruiter: "OldRec",
          rollbackId: null,
        },
      ],
      NOW,
    );
    assert.equal(indexed["c-stale"]?.stale, true);
    assert.equal(isEvidenceStale("2025-01-01T00:00:00.000Z", NOW), true);

    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "c-stale" })],
      assignmentAudits: [
        {
          id: "old",
          at: "2025-01-01T00:00:00.000Z",
          candidateId: "c-stale",
          candidateName: "X",
          action: "assigned",
          recruiter: "OldRec",
          confidence: 1,
          reason: "old",
          executionMode: "production",
          beforeRecruiter: null,
          afterRecruiter: "OldRec",
          rollbackId: null,
        },
      ],
      nowMs: NOW,
    });
    // Stale audit excluded from bundle.executedAssignmentByCandidate
    assert.equal(bundle.executedAssignmentByCandidate["c-stale"], undefined);
    const result = resolveRecruiterEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, false);
  });

  it("detects conflicting job evidence across priority sources", () => {
    const bundle = buildEnrichmentBundle({
      workflows: [wf({ candidateId: "j-conflict" })],
      breezyCandidates: [
        breezy({
          candidateId: "j-conflict",
          positionId: "pos-A",
          positionName: "Title",
          city: "Ames",
          state: "IA",
        }),
      ],
      operatorConfirmedJob: { "j-conflict": "pos-B" },
      nowMs: NOW,
    });
    // operator is lowest priority but conflicts with position ID
    const result = resolveJobEnrichment(bundle.workflows[0], bundle, NOW);
    assert.equal(result.resolved, false);
    assert.equal(result.conflicting, true);
  });

  it("excludes bypass cohort from recommend-ready and keeps side effects zero", () => {
    const workflows = [
      wf({
        candidateId: "bypass-1",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        paperworkSentAt: "2026-07-01T00:00:00.000Z",
        history: [
          { at: "2026-07-01", message: "Applied" },
          { at: "2026-07-02", message: "Paperwork Sent via onboarding reconcile" },
        ],
      }),
      wf({
        candidateId: "good-1",
        workflowStatus: "Applied",
        lastActionAt: "2026-07-09T12:00:00.000Z",
      }),
    ];
    const candidate = breezy({
      candidateId: "good-1",
      positionId: "pos-good",
      positionName: "Role",
      city: "Ames",
      state: "IA",
    });
    (candidate as unknown as { owner: { name: string } }).owner = { name: "Taylor" };

    const bundle = buildEnrichmentBundle({
      workflows,
      breezyCandidates: [
        candidate,
        breezy({ candidateId: "bypass-1", positionId: "pos-b", positionName: "B" }),
      ],
      operatorConfirmedRecruiter: { "bypass-1": "Taylor" },
      operatorConfirmedJob: { "bypass-1": "pos-b" },
      nowMs: NOW,
    });

    const pipeline = runP1882EnrichmentPipeline({ bundle, nowMs: NOW });
    assert.equal(pipeline.sideEffects.productionWrites, 0);
    assert.equal(pipeline.sideEffects.approvals, 0);
    assert.equal(pipeline.sideEffects.paperworkSends, 0);
    assert.equal(pipeline.sideEffects.melWrites, 0);
    assert.equal(pipeline.sideEffects.recommendationsExecuted, 0);
    assert.equal(pipeline.bypass.excludedFromP187, true);
    assert.equal(pipeline.bypass.recommendationsCreated, 0);
  });

  it("defaults to preview-only and refuses production writes", () => {
    const refused = refuseProductionEnrichmentWrite({
      enrichmentWriteExecutionFlag: true,
      allowProductionWrites: true,
      operatorAuthorizationToken: "OPERATOR-OK",
    });
    assert.equal(refused.allowed, false);
    assert.equal(refused.productionWrites, 0);

    const off = refuseProductionEnrichmentWrite({
      enrichmentWriteExecutionFlag: false,
      allowProductionWrites: false,
    });
    assert.equal(off.allowed, false);
    assert.match(off.detail, /preview only/i);
  });

  it("recalculates P188 readiness and forecasts P187 without executing", () => {
    const workflows = [
      wf({
        candidateId: "ready-1",
        workflowStatus: "Applied",
        lastActionAt: "2026-07-09T12:00:00.000Z",
      }),
    ];
    const candidate = breezy({
      candidateId: "ready-1",
      positionId: "pos-ready",
      positionName: "Specialist",
      city: "Ames",
      state: "IA",
    });
    (candidate as unknown as { owner: { name: string } }).owner = { name: "Taylor" };

    const bundle = buildEnrichmentBundle({
      workflows,
      breezyCandidates: [candidate],
      nowMs: NOW,
    });
    const pipeline = runP1882EnrichmentPipeline({ bundle, nowMs: NOW });
    assert.equal(pipeline.bothResolvedCount, 1);
    assert.equal(pipeline.readiness.jobResolvedCount, 1);
    assert.equal(pipeline.readiness.recruiterResolvedCount, 1);
    assert.ok(pipeline.readiness.readyForRecommendHire >= 1);
    assert.ok(pipeline.readiness.predictedP187EligibleAfterValidRecommendations >= 1);
    assert.equal(pipeline.sideEffects.p187Executed, 0);
    assert.ok(pipeline.pilotCandidates.length <= 10);
    assert.equal(pipeline.writeAuthorizationPackage.executed, false);
    assert.equal(pipeline.writeAuthorizationPackage.productionWrites, 0);
  });

  it("ignores simulated assignment audits (executed production only)", () => {
    const indexed = indexExecutedAssignmentAudits([
      {
        id: "sim",
        at: "2026-07-08T00:00:00.000Z",
        candidateId: "c-sim",
        candidateName: "X",
        action: "simulated",
        recruiter: "SimRec",
        confidence: 1,
        reason: "sim",
        executionMode: "simulation",
        beforeRecruiter: null,
        afterRecruiter: "SimRec",
        rollbackId: null,
      },
      {
        id: "sim2",
        at: "2026-07-08T00:00:00.000Z",
        candidateId: "c-sim2",
        candidateName: "X",
        action: "assigned",
        recruiter: "FakeProd",
        confidence: 1,
        reason: "assigned but simulation mode",
        executionMode: "simulation",
        beforeRecruiter: null,
        afterRecruiter: "FakeProd",
        rollbackId: null,
      },
    ]);
    assert.equal(Object.keys(indexed).length, 0);
  });
});
