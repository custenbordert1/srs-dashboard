import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import {
  buildPaperworkEligibilityReconciliation,
  isReadyForPaperworkGradeSignal,
  pickPrimaryBlocker,
} from "@/lib/paperwork-eligibility-reconciliation";

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

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c-ready",
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
    resumeFields: {
      summary: "Experienced retail merchandiser.",
      workHistoryText: "Walmart reset associate\nTarget merchandiser",
    },
    questionnaireAnswers: [
      { question: "Do you have a smartphone?", answer: "Yes" },
      { question: "Do you have internet access?", answer: "Yes" },
      { question: "Are you comfortable with mobile apps?", answer: "Yes" },
      { question: "Reliable transportation?", answer: "Yes" },
      { question: "Merchandising experience", answer: "3 years" },
      { question: "Prior vendor experience", answer: "SRS, Acosta" },
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
    updatedDate: "2026-06-01",
    createdDate: "2026-06-01",
    location: "Dallas, TX",
    department: "",
    description: "",
    type: "",
    category: "",
    experience: "",
    education: "",
    tags: [],
    recruiter: "",
    hiringManager: "",
  } as BreezyJob;
}

describe("paperwork-eligibility-reconciliation (P88)", () => {
  it("never enables live paperwork sends from reconciliation path", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("assigns exactly one primary blocker per ready-grade candidate", () => {
    const jobs = new Map([[publishedJob().jobId, publishedJob()]]);
    const rows = [
      buildScoredWorkflowRow(
        sampleCandidate({ candidateId: "ready-1" }),
        {
          candidateId: "ready-1",
          workflowStatus: "Applied",
          assignedRecruiter: "Jordan Smith",
          assignedDM: "DM South",
          notes: [],
          history: [],
        },
        { job: publishedJob() },
      ),
      buildScoredWorkflowRow(
        sampleCandidate({ candidateId: "ready-2", positionId: "closed" }),
        {
          candidateId: "ready-2",
          workflowStatus: "Applied",
          assignedRecruiter: "Jordan Smith",
          assignedDM: "DM South",
          notes: [],
          history: [],
        },
      ),
    ].map(asReadyGradeRow).filter(isReadyForPaperworkGradeSignal);

    const report = buildPaperworkEligibilityReconciliation({
      rows,
      jobsByPositionId: jobs,
    });

    assert.equal(report.summary.totalReadyGradeCandidates, rows.length);
    const primarySum = report.blockerBreakdown.reduce((sum, entry) => sum + entry.count, 0);
    assert.equal(primarySum, rows.length);
    for (const trace of report.traces) {
      assert.ok(trace.primaryBlockerId);
      assert.ok(trace.primaryBlockerLabel);
      assert.ok(trace.recommendedFix);
      assert.equal(trace.allBlockerIds.includes(trace.primaryBlockerId), true);
    }
  });

  it("does not double-count candidates across blocker breakdown categories", () => {
    const jobs = new Map([[publishedJob().jobId, publishedJob()]]);
    const row = asReadyGradeRow(
      buildScoredWorkflowRow(
        sampleCandidate(),
        {
          candidateId: "c-ready",
          workflowStatus: "Applied",
          assignedRecruiter: "Jordan Smith",
          assignedDM: "DM South",
          notes: [],
          history: [],
        },
        { job: publishedJob() },
      ),
    );
    if (!isReadyForPaperworkGradeSignal(row)) return;

    const report = buildPaperworkEligibilityReconciliation({
      rows: [row],
      jobsByPositionId: jobs,
    });
    const ids = new Set(report.traces.map((trace) => trace.candidateId));
    assert.equal(ids.size, report.traces.length);
    assert.equal(report.blockerBreakdown.reduce((s, b) => s + b.count, 0), report.traces.length);
  });

  it("explains P87 vs P84 mismatch for ready-grade candidates not at Paperwork Needed", () => {
    const jobs = new Map([[publishedJob().jobId, publishedJob()]]);
    const row = asReadyGradeRow(
      buildScoredWorkflowRow(
        sampleCandidate(),
        {
          candidateId: "c-ready",
          workflowStatus: "Applied",
          assignedRecruiter: "Jordan Smith",
          assignedDM: "DM South",
          notes: [],
          history: [],
        },
        { job: publishedJob() },
      ),
    );
    assert.equal(isReadyForPaperworkGradeSignal(row), true);

    const report = buildPaperworkEligibilityReconciliation({
      rows: [row],
      jobsByPositionId: jobs,
    });
    const trace = report.traces[0]!;
    assert.equal(trace.p84.eligible, false);
    assert.equal(trace.p56.paperworkReady, true);
    assert.ok(
      trace.primaryBlockerId === "candidate_not_in_correct_stage" ||
        trace.primaryBlockerId === "workflow_state_stale",
    );
    assert.ok(
      report.ruleAlignment.explanation.includes("P84") ||
        report.ruleAlignment.primaryMismatch.includes("P84") ||
        report.ruleAlignment.p84EligibilityDefinition.includes("P84"),
    );
    assert.ok(trace.ruleMismatchNote?.includes("P84") || trace.ruleMismatchNote?.includes("P83"));
  });

  it("simulates P84 eligibility after hypothetical P83 advancement", () => {
    const jobs = new Map([[publishedJob().jobId, publishedJob()]]);
    const row = asReadyGradeRow(
      buildScoredWorkflowRow(
        sampleCandidate(),
        {
          candidateId: "c-ready",
          workflowStatus: "Applied",
          assignedRecruiter: "Jordan Smith",
          assignedDM: "DM South",
          notes: [],
          history: [],
        },
        { job: publishedJob() },
      ),
    );
    const report = buildPaperworkEligibilityReconciliation({
      rows: [row],
      jobsByPositionId: jobs,
    });
    const trace = report.traces[0]!;
    assert.equal(trace.wouldBeEligibleAfterP83Advancement, true);
    assert.equal(trace.wouldBeEligibleAfterRecruiterAssignment, true);
  });

  it("pickPrimaryBlocker chooses the highest-priority blocker", () => {
    const primary = pickPrimaryBlocker([
      "candidate_not_in_correct_stage",
      "job_closed_unpublished",
      "recruiter_assignment_missing",
    ]);
    assert.equal(primary, "job_closed_unpublished");
  });
});
