import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_P71_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildApplicantQueryAnswer,
  buildPaperworkQueryAnswer,
  resolveExecutiveQueryId,
  runExecutiveQueryPreview,
  SUPPORTED_EXECUTIVE_QUERIES,
} from "@/lib/executive-natural-language-queries";

const REFERENCE = "2026-06-26T15:00:00.000Z";

function breezyCandidate(overrides: Partial<BreezyCandidate> & { candidateId: string }): BreezyCandidate {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate: overrides.appliedDate ?? "2026-06-26T10:00:00.000Z",
    addedDate: overrides.appliedDate ?? "2026-06-26T10:00:00.000Z",
    positionName: "Merchandiser",
    city: "Indianapolis",
    state: "IN",
    positionId: "pos-1",
    jobId: "job-1",
    tags: [],
    customFields: [],
    resumeUrl: "",
    coverLetter: "",
    breezyScore: 0,
    ...overrides,
  };
}

function workflowRow(overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId: string }): ScoredCandidateWorkflowRow {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    assignedRecruiter: "Taylor",
    actionGeneratedAt: "2026-06-25T10:00:00.000Z",
    aiGrade: "B",
    workflowStatus: "Paperwork Sent",
    paperworkStatus: "sent",
    paperworkSentAt: "2026-06-26T09:00:00.000Z",
    paperworkSignedAt: null,
    paperworkError: null,
    actionType: "await-signature",
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

describe("executive-natural-language-queries", () => {
  it("lists supported applicant and paperwork questions", () => {
    assert.equal(SUPPORTED_EXECUTIVE_QUERIES.length, 59);
    assert.ok(SUPPORTED_EXECUTIVE_QUERIES.some((row) => row.id === "applicants_today"));
    assert.ok(SUPPORTED_EXECUTIVE_QUERIES.some((row) => row.id === "paperwork_signed_today"));
    assert.ok(SUPPORTED_EXECUTIVE_QUERIES.some((row) => row.id === "paperwork_ready_for_auto"));
  });

  it("resolves P70 natural language questions", () => {
    assert.equal(resolveExecutiveQueryId("how many were automatically sent today"), "paperwork_auto_sent_today");
    assert.equal(resolveExecutiveQueryId("ready for automatic paperwork"), "paperwork_ready_for_auto");
  });

  it("resolves natural language questions to query ids", () => {
    assert.equal(resolveExecutiveQueryId("How many applicants applied today?"), "applicants_today");
    assert.equal(resolveExecutiveQueryId("paperwork sent this week"), "paperwork_sent_week");
    assert.equal(resolveExecutiveQueryId("unknown question"), null);
  });

  it("answers applicants today with yesterday comparison", () => {
    const candidates = [
      ...Array.from({ length: 3 }, (_, index) =>
        breezyCandidate({ candidateId: `today-${index}`, appliedDate: "2026-06-26T08:00:00.000Z" }),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        breezyCandidate({ candidateId: `yesterday-${index}`, appliedDate: "2026-06-25T08:00:00.000Z" }),
      ),
    ];

    const answer = buildApplicantQueryAnswer({
      queryId: "applicants_today",
      candidates,
      fetchedAt: REFERENCE,
    });

    assert.equal(answer.total, 3);
    assert.equal(answer.comparison?.value, 2);
    assert.equal(answer.comparison?.delta, 1);
    assert.equal(answer.comparison?.direction, "up");
    assert.equal(answer.previewMode, true);
  });

  it("answers paperwork today with sent signed and pending", () => {
    const rows = [
      workflowRow({ candidateId: "sent-1", paperworkStatus: "sent" }),
      workflowRow({
        candidateId: "signed-1",
        paperworkStatus: "signed",
        paperworkSignedAt: "2026-06-26T11:00:00.000Z",
      }),
      workflowRow({
        candidateId: "sent-2",
        paperworkStatus: "viewed",
        paperworkSentAt: "2026-06-26T07:00:00.000Z",
      }),
    ];

    const answer = buildPaperworkQueryAnswer({
      queryId: "paperwork_sent_today",
      candidates: rows,
      onboardingRecords: [],
      fetchedAt: REFERENCE,
    });

    assert.equal(answer.metrics.sent, 3);
    assert.equal(answer.metrics.signed, 1);
    assert.equal(answer.metrics.pending, 2);
  });

  it("runs preview without production writes", async () => {
    const result = await runExecutiveQueryPreview({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: [workflowRow({ candidateId: "c-1" })],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: DEFAULT_P71_FEATURE_FLAGS,
      sendQueueMetrics: null,
      question: "How many applicants applied today?",
      fetchedAt: REFERENCE,
    });

    assert.equal(result.previewMode, true);
    assert.equal(result.ok, true);
    assert.equal(result.answer?.queryId, "applicants_today");
    assert.equal(result.dashboard.cards.length, 2);
    assert.equal(result.dashboard.recentAnswers.length, 59);
    assert.ok(result.warnings.some((row) => /preview mode/i.test(row)));
  });
});
