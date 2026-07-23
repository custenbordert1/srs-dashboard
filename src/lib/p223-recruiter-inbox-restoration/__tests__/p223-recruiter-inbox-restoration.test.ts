import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { assignRecruiterInboxSection } from "@/lib/recruiter-action-queue-filters";
import {
  P223_ACTIVE_VISIBILITY_STAGES,
  P223_TERMINAL_STAGES,
  buildP223WorkflowRestoredCandidate,
  invalidateP223WorkflowClientCache,
  isP223OperationallyActiveWorkflowStage,
  isP223TerminalWorkflowStage,
  p223ListMembershipSource,
  retainP223RestoredThroughScope,
  unionP223InboxCandidates,
} from "@/lib/p223-recruiter-inbox-restoration";
import { setCached, getCached, cacheKey } from "@/lib/client-api-cache";

function ownedByActing(row: { assignedRecruiter: string }, actingRecruiter: string): boolean {
  const recruiter = row.assignedRecruiter.trim();
  return recruiter.length > 0 && recruiter === actingRecruiter.trim();
}

function wf(
  candidateId: string,
  status: CandidateWorkflowRecord["workflowStatus"],
  patch: Partial<CandidateWorkflowRecord> = {},
): CandidateWorkflowRecord {
  return {
    candidateId,
    workflowStatus: status,
    notes: [],
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    lastActionAt: "2026-07-20T14:29:06.260Z",
    nextActionNeeded: "Wait for signature",
    history: [],
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: status === "Paperwork Sent" ? "2026-07-20T14:29:06.260Z" : null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: status === "Paperwork Sent" ? "sent" : "not_sent",
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: "2026-07-20T14:29:06.260Z",
    ...patch,
  };
}

function breezy(candidateId: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId,
    firstName: "Ingested",
    lastName: "Person",
    email: `${candidateId}@example.com`,
    phone: "555",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-07-10",
    createdDate: "2026-07-10",
    addedDate: "2026-07-10",
    updatedDate: "2026-07-10",
    addedDateSource: "creation_date",
    positionId: "pos1",
    positionName: "Merchandiser",
    city: "Columbus",
    state: "OH",
    zipCode: "43215",
    resumeText: "",
    hasResume: false,
    ...patch,
  };
}

describe("P223 active / terminal stage rules", () => {
  it("includes Paperwork Sent and Qualified as operationally active", () => {
    assert.equal(isP223OperationallyActiveWorkflowStage("Paperwork Sent"), true);
    assert.equal(isP223OperationallyActiveWorkflowStage("Qualified"), true);
    assert.equal(isP223OperationallyActiveWorkflowStage("Ready for MEL"), true);
    assert.ok(P223_ACTIVE_VISIBILITY_STAGES.includes("Paperwork Needed"));
  });

  it("excludes terminal stages", () => {
    for (const stage of P223_TERMINAL_STAGES) {
      assert.equal(isP223TerminalWorkflowStage(stage), true);
      assert.equal(isP223OperationallyActiveWorkflowStage(stage), false);
    }
  });

  it("does not restore Applied / Needs Review into the union", () => {
    assert.equal(isP223OperationallyActiveWorkflowStage("Applied"), false);
    assert.equal(isP223OperationallyActiveWorkflowStage("Needs Review"), false);
  });
});

describe("P223 union / list membership", () => {
  it("keeps ingestion candidate and overlays via scored row builder", () => {
    const ingestion = [breezy("ing1")];
    const workflows = {
      ing1: wf("ing1", "Paperwork Sent", {
        assignedDM: "Mindie Rodriguez",
        signatureRequestId: "sig_1",
        paperworkStatus: "sent",
      }),
    };
    const union = unionP223InboxCandidates({ ingestionCandidates: ingestion, workflows });
    assert.equal(union.candidates.length, 1);
    assert.equal(p223ListMembershipSource(union.candidates[0]!), "ingestion");
    const row = buildBaselineWorkflowRow(union.candidates[0]!, workflows.ing1);
    assert.equal(row.workflowStatus, "Paperwork Sent");
    assert.equal(row.assignedDM, "Mindie Rodriguez");
    assert.equal(row.firstName, "Ingested");
  });

  it("restores workflow-only active candidates", () => {
    const union = unionP223InboxCandidates({
      ingestionCandidates: [],
      workflows: {
        "0f25dd13d4ed": wf("0f25dd13d4ed", "Paperwork Sent", {
          assignedDM: "Mindie Rodriguez",
          onboardingContactEmail: "jkggwhite1971@gmail.com",
          signatureRequestId: "sig_a",
        }),
      },
      profilesById: {
        "0f25dd13d4ed": {
          candidateId: "0f25dd13d4ed",
          firstName: "John",
          lastName: "Henry White",
          city: "Columbus",
          state: "OH",
          positionId: "73048dbe5519",
          positionName: "Retail Merchandiser",
        },
      },
    });
    assert.equal(union.restoredCount, 1);
    assert.equal(union.candidates[0]!.listMembershipSource, "workflow_restored");
    assert.equal(union.candidates[0]!.email, "jkggwhite1971@gmail.com");
    assert.equal(union.candidates[0]!.firstName, "John");
  });

  it("excludes workflow-only terminal candidates", () => {
    const union = unionP223InboxCandidates({
      ingestionCandidates: [],
      workflows: {
        term1: wf("term1", "Not Qualified"),
        term2: wf("term2", "Active Rep"),
      },
    });
    assert.equal(union.restoredCount, 0);
    assert.ok(union.skippedTerminalIds.includes("term1"));
    assert.ok(union.skippedTerminalIds.includes("term2"));
  });

  it("prevents duplicates when candidate exists in both sources", () => {
    const union = unionP223InboxCandidates({
      ingestionCandidates: [breezy("dup1", { firstName: "FromIngestion" })],
      workflows: {
        dup1: wf("dup1", "Paperwork Sent", {
          onboardingContactEmail: "other@example.com",
        }),
      },
      profilesById: {
        dup1: {
          candidateId: "dup1",
          firstName: "FromWorkflowProfile",
          email: "other@example.com",
        },
      },
    });
    assert.equal(union.candidates.length, 1);
    assert.equal(union.candidates[0]!.firstName, "FromIngestion");
    assert.equal(p223ListMembershipSource(union.candidates[0]!), "ingestion");
    assert.ok(union.skippedAlreadyInIngestionIds.includes("dup1"));
  });

  it("prefers ingestion profile fields and workflow ownership fields after overlay", () => {
    const candidate = breezy("pref1", {
      firstName: "IngestedName",
      email: "ingested@example.com",
      city: "Dayton",
    });
    const workflow = wf("pref1", "Paperwork Sent", {
      assignedRecruiter: "Unassigned",
      assignedDM: "Amy Harp",
      onboardingContactEmail: "workflow@example.com",
      signatureRequestId: "sig_pref",
    });
    const union = unionP223InboxCandidates({
      ingestionCandidates: [candidate],
      workflows: { pref1: workflow },
    });
    const row = buildBaselineWorkflowRow(union.candidates[0]!, workflow);
    assert.equal(row.firstName, "IngestedName");
    assert.equal(row.email, "ingested@example.com");
    assert.equal(row.city, "Dayton");
    assert.equal(row.assignedDM, "Amy Harp");
    assert.equal(row.assignedRecruiter, "Unassigned");
    assert.equal(row.workflowStatus, "Paperwork Sent");
    assert.equal(row.signatureRequestId, "sig_pref");
  });
});

describe("P223 ownership filtering unchanged", () => {
  it("Unassigned restored candidate matches acting Unassigned only", () => {
    const restored = buildP223WorkflowRestoredCandidate({
      workflow: wf("u1", "Paperwork Sent", { assignedRecruiter: "Unassigned" }),
      profile: { candidateId: "u1", firstName: "A", lastName: "B" },
    });
    const row = buildBaselineWorkflowRow(
      restored,
      wf("u1", "Paperwork Sent", { assignedRecruiter: "Unassigned" }),
    );
    assert.equal(ownedByActing(row, "Unassigned"), true);
    assert.equal(ownedByActing(row, "Taylor"), false);
    assert.equal(ownedByActing(row, "Recruiting Team"), false);
  });

  it("does not auto-assign Taylor", () => {
    const union = unionP223InboxCandidates({
      ingestionCandidates: [],
      workflows: {
        t1: wf("t1", "Paperwork Sent", { assignedRecruiter: "Unassigned" }),
      },
    });
    const row = buildBaselineWorkflowRow(union.candidates[0]!, wf("t1", "Paperwork Sent"));
    assert.equal(row.assignedRecruiter, "Unassigned");
  });
});

describe("P223 Paperwork Sent queue placement", () => {
  it("places Paperwork Sent in paperwork-pending only", () => {
    const restored = buildP223WorkflowRestoredCandidate({
      workflow: wf("q1", "Paperwork Sent"),
      profile: { candidateId: "q1", firstName: "Q", lastName: "One" },
    });
    const row = buildBaselineWorkflowRow(restored, wf("q1", "Paperwork Sent"));
    assert.equal(assignRecruiterInboxSection(row, "Unassigned"), "paperwork-pending");
    assert.notEqual(assignRecruiterInboxSection(row, "Unassigned"), "overdue-follow-ups");
    assert.notEqual(assignRecruiterInboxSection(row, "Unassigned"), "interview-needed");
    assert.notEqual(assignRecruiterInboxSection(row, "Unassigned"), "ready-for-mel");
  });

  it("places Qualified in interview-needed and Ready for MEL in ready-for-mel", () => {
    const interview = buildBaselineWorkflowRow(
      buildP223WorkflowRestoredCandidate({
        workflow: wf("i1", "Qualified"),
        profile: { candidateId: "i1", firstName: "I", lastName: "One" },
      }),
      wf("i1", "Qualified"),
    );
    const ready = buildBaselineWorkflowRow(
      buildP223WorkflowRestoredCandidate({
        workflow: wf("m1", "Ready for MEL"),
        profile: { candidateId: "m1", firstName: "M", lastName: "One" },
      }),
      wf("m1", "Ready for MEL"),
    );
    assert.equal(assignRecruiterInboxSection(interview, "Unassigned"), "interview-needed");
    assert.equal(assignRecruiterInboxSection(ready, "Unassigned"), "ready-for-mel");
    assert.notEqual(assignRecruiterInboxSection(ready, "Unassigned"), "paperwork-pending");
  });
});

describe("P223 scope retention + cache invalidation", () => {
  it("retains restored rows that MTD scope would drop", () => {
    const restored = buildP223WorkflowRestoredCandidate({
      workflow: wf("old1", "Paperwork Sent"),
      profile: {
        candidateId: "old1",
        firstName: "Old",
        lastName: "Applicant",
        appliedDate: "2026-04-01",
      },
    });
    // Force an old appliedDate after build to simulate scope exclusion.
    restored.appliedDate = "2026-04-01";
    restored.addedDate = "2026-04-01";
    restored.createdDate = "2026-04-01";
    const scoped: BreezyCandidate[] = [];
    const retained = retainP223RestoredThroughScope({
      allCandidates: [restored],
      scopedCandidates: scoped,
    });
    assert.equal(retained.length, 1);
    assert.equal(retained[0]!.candidateId, "old1");
  });

  it("invalidates the workflows client cache prefix", () => {
    const key = cacheKey(["candidates", "workflows"]);
    setCached(key, { ok: true }, 120_000);
    assert.ok(getCached(key));
    invalidateP223WorkflowClientCache();
    assert.equal(getCached(key), null);
  });

  it("preserves scored-row typing through retainP223RestoredThroughScope", () => {
    const restored = buildP223WorkflowRestoredCandidate({
      workflow: wf("typed1", "Paperwork Sent"),
      profile: { candidateId: "typed1", firstName: "T", lastName: "One" },
    });
    const scored = buildBaselineWorkflowRow(restored, wf("typed1", "Paperwork Sent"));
    const retained = retainP223RestoredThroughScope({
      allCandidates: [scored],
      scopedCandidates: [],
    });
    assert.equal(retained.length, 1);
    assert.equal(retained[0]!.workflowStatus, "Paperwork Sent");
    assert.equal(retained[0]!.assignedRecruiter, "Unassigned");
  });
});

describe("P223 P221 regression targets", () => {
  it("restores both P221 candidates into Paperwork pending under Unassigned", () => {
    const columbus = "0f25dd13d4ed";
    const kc = "bc2111302660";
    const workflows = {
      [columbus]: wf(columbus, "Paperwork Sent", {
        assignedDM: "Mindie Rodriguez",
        assignedRecruiter: "Unassigned",
        signatureRequestId: "32a3cf53f36b78c86a91e6d48c4ba0bfe956ea11",
        onboardingContactEmail: "jkggwhite1971@gmail.com",
      }),
      [kc]: wf(kc, "Paperwork Sent", {
        assignedDM: "Amy Harp",
        assignedRecruiter: "Unassigned",
        signatureRequestId: "94f692a2f2cd4e9296cf6adff3cacac6b22a4519",
        onboardingContactEmail: "mjmwell@aol.com",
      }),
    };
    const union = unionP223InboxCandidates({
      ingestionCandidates: [breezy("other")],
      workflows,
      profilesById: {
        [columbus]: {
          candidateId: columbus,
          firstName: "John",
          lastName: "Henry White",
          city: "Columbus",
          state: "OH",
        },
        [kc]: {
          candidateId: kc,
          firstName: "Kathy",
          lastName: "Meyer",
          city: "Kansas City",
          state: "MO",
        },
      },
    });
    assert.equal(union.restoredCount, 2);
    for (const id of [columbus, kc] as const) {
      const candidate = union.candidates.find((row) => row.candidateId === id)!;
      const row = buildBaselineWorkflowRow(candidate, workflows[id]);
      assert.equal(row.listMembershipSource, "workflow_restored");
      assert.equal(row.assignedRecruiter, "Unassigned");
      assert.equal(assignRecruiterInboxSection(row, "Unassigned"), "paperwork-pending");
      assert.equal(ownedByActing(row, "Taylor"), false);
      assert.equal(ownedByActing(row, "Unassigned"), true);
    }
    assert.equal(union.candidates.filter((c) => c.candidateId === columbus).length, 1);
    assert.equal(union.candidates.filter((c) => c.candidateId === kc).length, 1);
  });
});
