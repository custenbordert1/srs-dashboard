import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { buildP62AssignmentPreview } from "@/lib/p62-assignment-preview/build-p62-assignment-preview";
import type { PublishedJobGateTrace } from "@/lib/published-job-gate-audit/types";
import { simulateDownstreamAfterAssignment } from "@/lib/p62-assignment-preview/simulate-downstream";

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

function cohortTrace(patch: Partial<PublishedJobGateTrace> = {}): PublishedJobGateTrace {
  return {
    candidateId: "q-1",
    candidateName: "Gary Smigocki",
    positionId: "p-published",
    jobTitle: "Retail Support Merchandiser",
    city: "Woodbury",
    state: "NJ",
    dmTerritory: "NJ",
    suggestedDm: "Melissa O'Connor",
    assignedDm: "Melissa O'Connor",
    dmNeedsAssignment: false,
    recruiter: { assigned: "Unassigned", recommended: "Taylor", assignmentConfidence: 65, missing: true },
    p83: { action: "hold", shouldAdvance: false, shouldPersist: true, reason: "Awaiting recruiter" },
    workflowStatus: "Applied",
    actionType: "none",
    breezyStage: "Applied",
    stageMapping: {
      breezyStage: "Applied",
      localWorkflowStatus: "Applied",
      expectedAfterP83: "Paperwork Needed",
      aligned: false,
    },
    breezyPositionMapping: {
      positionId: "p-published",
      jobInPublishedList: true,
      jobInLiveFetch: true,
      liveBreezyStatus: "published",
      positionNameMatch: true,
    },
    candidateToPosition: {
      candidatePositionId: "p-published",
      auditedJobPositionId: "p-published",
      matches: true,
    },
    p84: { eligible: false, blockingReasons: ["Awaiting recruiter assignment."], failedGateIds: ["recruiter_assigned"] },
    primaryBlocker: "missing_recruiter_assignment",
    primaryBlockerLabel: "Missing Recruiter Assignment",
    blockerReason: "No recruiter assigned",
    fixableWithoutBreezyJobAction: true,
    shouldRemainBlocked: false,
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

describe("p62-assignment-preview (P94)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("gives every candidate exactly one assignable or human-review outcome", () => {
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
    const report = buildP62AssignmentPreview({
      cohortTraces: [cohortTrace()],
      rowsByCandidateId: new Map([["q-1", row]]),
      jobMetaByPositionId: new Map([
        ["p-published", { jobTitle: "Retail Support Merchandiser", city: "Woodbury", state: "NJ" }],
      ]),
      jobsByPositionId: new Map([
        ["p-published", { jobId: "p-published", name: "Retail Support Merchandiser", status: "published" } as BreezyJob],
      ]),
      workflows: {},
      rosters: { recruiters: ["Taylor", "Alex"], dms: ["Melissa O'Connor"] },
      onboardingByCandidateId: new Map(),
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    });

    assert.equal(report.metrics.candidatesReviewed, 1);
    const entry = report.entries[0];
    assert.ok(entry);
    assert.ok(entry.outcome === "assignable" || entry.outcome === "human_review");
    if (entry.outcome === "assignable") {
      assert.equal(entry.humanReviewReason, null);
      assert.ok(entry.recommendedRecruiter);
    } else {
      assert.ok(entry.humanReviewReason);
    }
  });

  it("simulates P84 eligibility after assignment and P83 advancement", () => {
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
    const simulated = simulateDownstreamAfterAssignment({
      row,
      assignedRecruiter: "Taylor",
      jobsByPositionId: new Map([
        ["p-published", { jobId: "p-published", status: "published" } as BreezyJob],
      ]),
      onboarding: null,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      assignmentApplied: true,
    });

    assert.equal(simulated.expectedWorkflowStatus, "Paperwork Needed");
    assert.equal(simulated.expectedActionType, "send-paperwork");
    assert.equal(simulated.p84EligibleAfterSimulation, true);
    assert.equal(simulated.stillBlockedAfterAssignment, false);
  });

  it("does not count human-review assignments toward recruiter distribution", () => {
    const row = asReadyRow(
      buildScoredWorkflowRow(sampleCandidate({ state: "" }), {
        candidateId: "q-1",
        workflowStatus: "Applied",
        assignedRecruiter: "Unassigned",
        notes: [],
        history: [],
      }),
    );
    const report = buildP62AssignmentPreview({
      cohortTraces: [cohortTrace()],
      rowsByCandidateId: new Map([["q-1", row]]),
      jobMetaByPositionId: new Map([
        ["p-published", { jobTitle: "Retail Support Merchandiser", city: "", state: "" }],
      ]),
      jobsByPositionId: new Map(),
      workflows: {},
      rosters: { recruiters: ["Taylor"], dms: [] },
      onboardingByCandidateId: new Map(),
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    });
    assert.equal(report.metrics.candidatesNeedingHumanReview, 1);
    assert.equal(report.recruiterDistribution.length, 0);
  });
});
