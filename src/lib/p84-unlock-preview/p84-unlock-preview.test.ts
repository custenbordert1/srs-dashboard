import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildP84UnlockPreview } from "@/lib/p84-unlock-preview/build-p84-unlock-preview";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "unlock-1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
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
    resumeText:
      "Retail merchandiser with Walmart reset experience. Customer service and phone support background. Cash handling and POS. Team lead experience. Willing to travel 50 miles. 2019-2021 Walmart. 2023-2025 Target merchandising.",
    hasResume: true,
    questionnaireAnswers: [
      { question: "Do you have a smartphone?", answer: "Yes" },
      { question: "Do you have internet access?", answer: "Yes" },
      { question: "Are you comfortable with mobile apps?", answer: "Yes" },
      { question: "Reliable transportation?", answer: "Yes" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

function publishedJob(): BreezyJob {
  return {
    jobId: "p1",
    name: "Field Merchandiser",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    status: "published",
  } as BreezyJob;
}

function asReadyGradeRow(row: ScoredCandidateWorkflowRow): ScoredCandidateWorkflowRow {
  return {
    ...row,
    dmNeedsAssignment: false,
    candidateGrade: {
      ...row.candidateGrade,
      paperworkReady: true,
      categoryScores: {
        ...row.candidateGrade.categoryScores,
        paperworkReadiness: 75,
      },
    },
  };
}

describe("p84-unlock-preview (P89)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("builds a full recovery plan for unlockable ready-grade candidates", () => {
    const row = asReadyGradeRow(
      buildScoredWorkflowRow(
        sampleCandidate(),
        {
          candidateId: "unlock-1",
          workflowStatus: "Applied",
          assignedRecruiter: "Unassigned",
          assignedDM: "DM South",
          notes: [],
          history: [],
        },
        { job: publishedJob() },
      ),
    );
    const report = buildP84UnlockPreview({
      rows: [row],
      jobsByPositionId: new Map(),
      workflows: {},
      rosters: { recruiters: ["Jordan Smith", "Recruiting Team"], dms: ["DM South"] },
    });
    const plan = report.unlockable[0] ?? report.recoveryPlans[0];
    assert.ok(plan);
    assert.ok(plan.candidateName);
    assert.ok(plan.breezyCandidateId);
    assert.ok(plan.positionId);
    assert.ok(plan.requiredFixes.length > 0);
    assert.equal(plan.jobMustBePublished, true);
    assert.equal(plan.recruiterAssignmentMissing, true);
    assert.equal(plan.expectedP84ResultAfterFixes, "eligible");
    assert.equal(plan.unlockScenarios.allOperationalFixes, true);
  });

  it("keeps paperwork-sent candidates in monitor-only group", () => {
    const row = asReadyGradeRow(
      buildScoredWorkflowRow(
        sampleCandidate({ candidateId: "sent-1" }),
        {
          candidateId: "sent-1",
          workflowStatus: "Paperwork Sent",
          assignedRecruiter: "Jordan Smith",
          assignedDM: "DM South",
          notes: [],
          history: [],
          signatureRequestId: "sig-1",
          paperworkStatus: "sent",
        } as never,
        { job: publishedJob() },
      ),
    );
    const report = buildP84UnlockPreview({
      rows: [row],
      jobsByPositionId: new Map([[publishedJob().jobId, publishedJob()]]),
      workflows: {},
      rosters: { recruiters: ["Jordan Smith"], dms: ["DM South"] },
    });
    assert.equal(report.monitorOnly.length, 1);
    assert.equal(report.unlockable.length, 0);
    assert.equal(report.monitorOnly[0]?.group, "monitor_only");
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
          assignedRecruiter: "Jordan",
          assignedDM: "DM",
          notes: [],
          history: [],
          signatureRequestId: "sig",
          paperworkStatus: "sent",
        } as never),
      ),
    ];
    const report = buildP84UnlockPreview({
      rows,
      jobsByPositionId: new Map(),
      workflows: {},
      rosters: { recruiters: ["Jordan Smith"], dms: ["DM"] },
    });
    const unlockIds = new Set(report.unlockable.map((p) => p.candidateId));
    const monitorIds = new Set(report.monitorOnly.map((p) => p.candidateId));
    const notFixableIds = new Set(report.notFixable.map((p) => p.candidateId));
    for (const id of unlockIds) {
      assert.equal(monitorIds.has(id), false);
      assert.equal(notFixableIds.has(id), false);
    }
    const grouped =
      report.currentEligible.length +
      report.unlockable.length +
      report.monitorOnly.length +
      report.notFixable.length;
    assert.equal(grouped, report.recoveryPlans.length);
  });
});
