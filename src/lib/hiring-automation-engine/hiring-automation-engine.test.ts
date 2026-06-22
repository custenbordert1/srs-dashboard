import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  evaluateApplicantReview,
  recommendNextStep,
  checkAutomationSafety,
  buildJobPipelineContext,
  recommendAdActions,
} from "@/lib/hiring-automation-engine";

function candidate(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-01",
    createdDate: "2026-06-01",
    addedDate: "2026-06-01",
    updatedDate: "2026-06-01",
    addedDateSource: "creation_date",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "Walmart reset merchandiser retail experience willing to travel.",
    hasResume: true,
    questionnaireAnswers: [
      { question: "Smartphone access", answer: "Yes" },
      { question: "Internet access", answer: "Yes" },
      { question: "Comfort with apps", answer: "Yes" },
      { question: "Merchandising experience", answer: "5 years" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: patch.paperworkStatus ?? "not_sent",
    signatureRequestId: patch.signatureRequestId ?? null,
    paperworkTemplateKey: patch.paperworkTemplateKey ?? null,
    paperworkSentAt: patch.paperworkSentAt ?? null,
    paperworkSignedAt: patch.paperworkSignedAt ?? null,
    paperworkError: patch.paperworkError ?? null,
    directDepositStatus: patch.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
  };
}

describe("hiring automation engine", () => {
  it("reviews qualified applicant from resume and questionnaire", () => {
    const row = buildScoredWorkflowRow(candidate("q1"), workflow("q1"));
    const review = evaluateApplicantReview(row);
    assert.equal(review.qualified, true);
    assert.ok(["A", "B"].includes(review.grade));
  });

  it("recommends paperwork for grade A/B with medium+ confidence", () => {
    const row = buildScoredWorkflowRow(candidate("q2"), workflow("q2"));
    const next = recommendNextStep(row, { onboardingConfigured: true });
    assert.equal(next.action, "send-paperwork");
    assert.equal(next.requiresApproval, true);
  });

  it("blocks paperwork send for low confidence", () => {
    const row = buildScoredWorkflowRow(
      candidate("low", { resumeText: "", hasResume: false, questionnaireAnswers: [] }),
      workflow("low"),
    );
    const safety = checkAutomationSafety("send-paperwork", row);
    assert.equal(safety.allowed, false);
  });

  it("never creates reject automation via safety layer", () => {
    const row = buildScoredWorkflowRow(
      candidate("d1", { stage: "Not Qualified" }),
      workflow("d1", { workflowStatus: "Not Qualified" }),
    );
    const next = recommendNextStep(row);
    assert.equal(next.action, "none");
  });

  it("recommends mark-ready-for-mel after signed paperwork", () => {
    const row = buildScoredWorkflowRow(candidate("signed"), workflow("signed", {
      workflowStatus: "Signed",
      paperworkStatus: "signed",
      paperworkSignedAt: "2026-06-10T12:00:00.000Z",
    }));
    const next = recommendNextStep(row);
    assert.equal(next.action, "mark-ready-for-mel");
  });

  it("recommends close ad when pipeline has enough qualified candidates", () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      buildScoredWorkflowRow(candidate(`c${i}`, { positionId: "job-1" }), workflow(`c${i}`)),
    );
    const contexts = buildJobPipelineContext(
      [{ positionId: "job-1", title: "Merchandiser", city: "Dallas", state: "TX" }],
      rows,
    );
    const recs = recommendAdActions(contexts);
    assert.ok(recs.some((r) => r.type === "close-pause-ad"));
    assert.equal(recs[0]?.requiresApproval, true);
  });

  it("recommends new ad when coverage gap exists", () => {
    const contexts = buildJobPipelineContext(
      [{ positionId: "job-2", title: "Merchandiser", city: "Austin", state: "TX", pipelineStatus: "published" }],
      [],
    );
    const recs = recommendAdActions(contexts);
    assert.ok(recs.some((r) => r.type === "create-new-ad"));
  });
});
