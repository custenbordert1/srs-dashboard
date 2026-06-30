import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildP84OperationalQueue } from "@/lib/p84-operational-queue/build-operational-queue";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "q-1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-05",
    createdDate: "2026-06-05",
    addedDate: "2026-06-05",
    updatedDate: "2026-06-05",
    addedDateSource: "creation_date",
    positionId: "p1",
    positionName: "Field Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "Retail merchandiser Walmart Target customer service travel willing 2019 walmart 2023 target resets",
    hasResume: true,
    questionnaireAnswers: [
      { question: "smartphone", answer: "Yes" },
      { question: "internet", answer: "Yes" },
      { question: "transportation", answer: "Yes" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

function asReadyGradeRow(row: ScoredCandidateWorkflowRow): ScoredCandidateWorkflowRow {
  return {
    ...row,
    dmNeedsAssignment: false,
    candidateGrade: {
      ...row.candidateGrade,
      paperworkReady: true,
      categoryScores: { ...row.candidateGrade.categoryScores, paperworkReadiness: 75 },
    },
  };
}

describe("p84-operational-queue (P90)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("gives every unlockable candidate at least one required next action", () => {
    const row = asReadyGradeRow(
      buildScoredWorkflowRow(sampleCandidate(), {
        candidateId: "q-1",
        workflowStatus: "Applied",
        assignedRecruiter: "Unassigned",
        assignedDM: "Unassigned",
        notes: [],
        history: [],
      }),
    );
    const report = buildP84OperationalQueue({
      rows: [row],
      jobsByPositionId: new Map(),
      workflows: {},
      rosters: { recruiters: ["Taylor"], dms: ["DM South"] },
    });
    const unlockable = report.unlockable[0];
    assert.ok(unlockable);
    assert.ok(unlockable.nextAction);
    assert.ok(unlockable.steps.length >= 5);
    assert.equal(unlockable.canEnterSendQueue, false);
    assert.equal(unlockable.steps.every((s) => s.manualApprovalRequired || s.stepId === "recheck_p84"), true);
  });

  it("keeps monitor-only candidates out of unlockable and send queue", () => {
    const row = asReadyGradeRow(
      buildScoredWorkflowRow(sampleCandidate({ candidateId: "m-1" }), {
        candidateId: "m-1",
        workflowStatus: "Paperwork Sent",
        assignedRecruiter: "Taylor",
        assignedDM: "DM",
        notes: [],
        history: [],
        signatureRequestId: "sig-1",
        paperworkStatus: "sent",
      } as never),
    );
    const report = buildP84OperationalQueue({
      rows: [row],
      jobsByPositionId: new Map([["p1", { jobId: "p1", status: "published" } as never]]),
      workflows: {},
      rosters: { recruiters: ["Taylor"], dms: ["DM"] },
    });
    assert.equal(report.monitorOnly.length, 1);
    assert.equal(report.unlockable.length, 0);
    assert.equal(report.monitorOnly[0]?.canEnterSendQueue, false);
    assert.equal(report.monitorOnly[0]?.queueStatus, "monitor_only");
  });

  it("does not place candidates in both unlockable and blocked groups", () => {
    const rows = [
      asReadyGradeRow(
        buildScoredWorkflowRow(sampleCandidate({ candidateId: "u1" }), {
          candidateId: "u1",
          workflowStatus: "Applied",
          assignedRecruiter: "Unassigned",
          assignedDM: "DM",
          notes: [],
          history: [],
        }),
      ),
      asReadyGradeRow(
        buildScoredWorkflowRow(sampleCandidate({ candidateId: "m1" }), {
          candidateId: "m1",
          workflowStatus: "Paperwork Sent",
          assignedRecruiter: "Taylor",
          assignedDM: "DM",
          notes: [],
          history: [],
          signatureRequestId: "sig",
          paperworkStatus: "sent",
        } as never),
      ),
    ];
    const report = buildP84OperationalQueue({
      rows,
      jobsByPositionId: new Map(),
      workflows: {},
      rosters: { recruiters: ["Taylor"], dms: ["DM"] },
    });
    const unlockIds = new Set(report.unlockable.map((e) => e.candidateId));
    const blockedIds = new Set(report.blocked.map((e) => e.candidateId));
    const monitorIds = new Set(report.monitorOnly.map((e) => e.candidateId));
    for (const id of unlockIds) {
      assert.equal(blockedIds.has(id), false);
      assert.equal(monitorIds.has(id), false);
    }
  });
});
