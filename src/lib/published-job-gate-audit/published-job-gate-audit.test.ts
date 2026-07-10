import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import type { JobStatusReconciliationEntry } from "@/lib/breezy-job-status-reconciliation/types";
import { classifyPrimaryBlocker, buildCandidateTrace } from "@/lib/published-job-gate-audit/classify-primary-blocker";
import { buildPublishedJobGateAudit } from "@/lib/published-job-gate-audit/build-published-job-gate-audit";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "q-1",
    firstName: "Gary",
    lastName: "Smigocki",
    email: "gary@example.com",
    phone: "555",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-05",
    createdDate: "2026-06-05",
    addedDate: "2026-06-05",
    updatedDate: "2026-06-05",
    addedDateSource: "creation_date",
    positionId: "p-published",
    positionName: "Retail Support Merchandiser",
    city: "Woodbury",
    state: "NJ",
    zipCode: "08096",
    resumeText: "Retail merchandiser Walmart Target customer service travel willing",
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

function publishedJobEntry(
  patch: Partial<JobStatusReconciliationEntry> = {},
): JobStatusReconciliationEntry {
  return {
    positionId: "p-published",
    jobTitle: "Retail Support Merchandiser",
    city: "Woodbury",
    state: "NJ",
    dmTerritory: "NJ",
    suggestedDm: "Melissa O'Connor",
    recommendedRecruiter: "Taylor",
    candidateCount: 1,
    blockedCandidateCount: 1,
    blockedCandidateIds: ["q-1"],
    blockedCandidateNames: ["Gary Smigocki"],
    breezyPipelineStatus: "published",
    resolvedStatus: "published",
    resolvedStatusLabel: "Published/Open",
    recommendation: "human_review",
    recommendationLabel: "Human Review",
    actionNeeded: "Audit mapping",
    riskLevel: "medium",
    reason: "Published but blocked",
    duplicateActiveJobId: null,
    duplicateActiveJobTitle: null,
    shouldStayActiveJobId: "p-published",
    liveFetchSucceeded: true,
    manualApprovalRequired: true,
    autoApproveBlocked: true,
    ...patch,
  };
}

function asReadyRow(row: ScoredCandidateWorkflowRow): ScoredCandidateWorkflowRow {
  return {
    ...row,
    dmNeedsAssignment: false,
    assignedDM: "Melissa O'Connor",
    candidateGrade: {
      ...row.candidateGrade,
      paperworkReady: true,
      categoryScores: { ...row.candidateGrade.categoryScores, paperworkReadiness: 75 },
    },
  };
}

describe("published-job-gate-audit (P93)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("assigns exactly one primary blocker per candidate", () => {
    const row = asReadyRow(
      buildScoredWorkflowRow(sampleCandidate(), {
        candidateId: "q-1",
        workflowStatus: "Applied",
        assignedRecruiter: "Unassigned",
        assignedDM: "Melissa O'Connor",
        notes: [],
        history: [],
      }),
    );
    const report = buildPublishedJobGateAudit({
      publishedJobEntries: [publishedJobEntry()],
      rowsByCandidateId: new Map([["q-1", row]]),
      jobsByPositionId: new Map([
        ["p-published", { jobId: "p-published", name: "Retail Support Merchandiser", status: "published" } as BreezyJob],
      ]),
      workflows: {},
      rosters: { recruiters: ["Taylor"], dms: ["Melissa O'Connor"] },
      onboardingByCandidateId: new Map(),
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    });

    assert.equal(report.metrics.totalPublishedJobsAudited, 1);
    assert.equal(report.metrics.candidatesTiedToPublishedJobs, 1);
    assert.equal(report.publishedJobs[0]?.traces.length, 1);
    assert.equal(report.publishedJobs[0]?.traces[0]?.primaryBlocker, "missing_recruiter_assignment");
    assert.equal(report.metrics.candidatesBlockedByP62, 1);
  });

  it("classifies applied-stage candidates on published jobs", () => {
    const row = asReadyRow(
      buildScoredWorkflowRow(sampleCandidate(), {
        candidateId: "q-1",
        workflowStatus: "Applied",
        actionType: "screen-candidate",
        assignedRecruiter: "Taylor",
        assignedDM: "Melissa O'Connor",
        notes: [],
        history: [],
      }),
    );
    const blocker = classifyPrimaryBlocker({
      row,
      p84Eligible: false,
      p84FailedGateIds: ["paperwork_needed", "send_paperwork_action"],
      p83ShouldAdvance: false,
      p83Action: "hold",
      jobInPublishedList: true,
      jobInLiveFetch: true,
      liveJobPublished: true,
      positionMatches: true,
      onboarding: null,
    });
    assert.equal(blocker, "candidate_still_in_applied");
  });

  it("flags paperwork already sent without duplicate counting", () => {
    const row = asReadyRow(
      buildScoredWorkflowRow(sampleCandidate(), {
        candidateId: "q-1",
        workflowStatus: "Paperwork Sent",
        assignedRecruiter: "Taylor",
        assignedDM: "Melissa O'Connor",
        notes: [],
        history: [],
        signatureRequestId: "sig-1",
        paperworkStatus: "sent",
      } as never),
    );
    const trace = buildCandidateTrace({
      row,
      jobEntry: publishedJobEntry(),
      jobsByPositionId: new Map([
        ["p-published", { jobId: "p-published", status: "published" } as BreezyJob],
      ]),
      onboarding: null,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      recommendedRecruiter: "Taylor",
      assignmentConfidence: 90,
      liveJobPublished: true,
    });
    assert.equal(trace.primaryBlocker, "paperwork_already_sent");
    assert.equal(trace.shouldRemainBlocked, true);
    assert.equal(trace.fixableWithoutBreezyJobAction, false);
  });

  it("detects stale published list cache when live job exists", () => {
    const row = asReadyRow(
      buildScoredWorkflowRow(sampleCandidate(), {
        candidateId: "q-1",
        workflowStatus: "Applied",
        assignedRecruiter: "Taylor",
        assignedDM: "Melissa O'Connor",
        notes: [],
        history: [],
      }),
    );
    const blocker = classifyPrimaryBlocker({
      row,
      p84Eligible: false,
      p84FailedGateIds: ["published_job"],
      p83ShouldAdvance: false,
      p83Action: "hold",
      jobInPublishedList: false,
      jobInLiveFetch: true,
      liveJobPublished: true,
      positionMatches: true,
      onboarding: null,
    });
    assert.equal(blocker, "data_stale_cache_issue");
  });
});
