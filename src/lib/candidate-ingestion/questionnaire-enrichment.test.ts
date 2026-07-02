import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { enrichBreezyCandidateWithQuestionnairePayload } from "@/lib/breezy-api";
import { buildCandidateAdvancementDecisions } from "@/lib/candidate-advancement-engine";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  applyQuestionnaireAnswersToCandidate,
  buildGradeContributors,
  buildQuestionnaireAnswersFromEnrichmentPayload,
  buildQuestionnaireIntelligence,
  buildResumeIntelligence,
  extractQuestionnaireAnswersFromBreezyCustomFields,
  extractQuestionnaireAnswersFromBreezyQuestionnaires,
} from "@/lib/candidate-readiness";
import {
  candidatePendingQuestionnaireEnrichment,
  listMtdCandidatesMissingQuestionnaire,
  listMtdCandidatesPendingQuestionnaireEnrichment,
} from "@/lib/candidate-ingestion/enrich-candidate-questionnaires";
import { emptyIngestionStore, mergeIngestedCandidates } from "@/lib/candidate-ingestion/ingestion-store";
import { mergeCandidateRecord } from "@/lib/candidate-ingestion/merge-candidate-record";

function baseCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-10",
    createdDate: "2026-06-10",
    addedDate: "2026-06-10",
    updatedDate: "2026-06-10",
    addedDateSource: "creation_date",
    positionId: "p1",
    positionName: "Field Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "Retail merchandiser with reset experience and travel willingness.",
    hasResume: true,
    ...patch,
  };
}

describe("questionnaire enrichment", () => {
  it("extracts questionnaire answers from Breezy questionnaires payload", () => {
    const answers = extractQuestionnaireAnswersFromBreezyQuestionnaires([
      {
        questions: [
          { question: "Do you have reliable transportation?", answer: "Yes" },
          { question: "Do you have a smartphone?", answer: "Yes" },
        ],
      },
    ]);
    assert.equal(answers.length, 2);
    assert.equal(answers[0]?.question, "Do you have reliable transportation?");
    assert.equal(answers[0]?.answer, "Yes");
  });

  it("extracts Breezy text/response fields and checkbox responses from questionnaires", () => {
    const answers = extractQuestionnaireAnswersFromBreezyQuestionnaires([
      {
        sections: [
          {
            questions: [
              {
                text: "How many years of professional merchandising experience do you have?",
                response: "3–5 years",
              },
            ],
          },
        ],
        questions: [
          {
            text: "What types of resets have you completed? (Select all that apply)",
            options: [{ text: "Simple shelf resets" }, { text: "Full aisle resets" }, { text: "Seasonal resets" }],
            responses: [true, false, true],
          },
          {
            text: "Do you have reliable transportation, a valid non-expired driver’s license, and are you 18 years of age or older?",
            response: "Yes",
          },
        ],
      },
    ]);
    assert.equal(answers.length, 3);
    assert.equal(answers[0]?.answer, "3–5 years");
    assert.equal(answers[1]?.answer, "Simple shelf resets, Seasonal resets");
    assert.equal(answers[2]?.answer, "Yes");
    assert.ok(!answers.some((entry) => entry.answer === entry.question));
  });

  it("extracts questionnaire answers from Breezy custom-fields payload", () => {
    const answers = extractQuestionnaireAnswersFromBreezyCustomFields([
      { name: "Internet access", value: "Yes" },
      { label: "Merchandising experience", answer: "2 years" },
    ]);
    assert.equal(answers.length, 2);
  });

  it("builds combined answers from detail, questionnaires, and custom-fields payloads", () => {
    const answers = buildQuestionnaireAnswersFromEnrichmentPayload({
      detail: {
        custom_attributes: [{ name: "Smartphone access", value: "Yes" }],
      },
      questionnaires: [
        {
          questions: [{ question: "Do you have reliable transportation?", answer: "Yes" }],
        },
      ],
      customFields: [{ name: "Internet access", value: "Yes" }],
    });
    assert.ok(answers.length >= 3);
  });

  it("persists questionnaire answers when merging ingestion records", () => {
    const store = emptyIngestionStore();
    const existing = baseCandidate({ questionnaireAnswers: undefined, hasQuestionnaire: false });
    const enriched = applyQuestionnaireAnswersToCandidate(existing, [
      { question: "Do you have reliable transportation?", answer: "Yes" },
      { question: "Do you have a smartphone?", answer: "Yes" },
      { question: "Do you have internet access?", answer: "Yes" },
      { question: "Are you comfortable with mobile apps?", answer: "Yes" },
    ]);
    const merged = mergeIngestedCandidates(store, [enriched]);
    const stored = merged.store.candidates.c1;
    assert.equal(stored?.hasQuestionnaire, true);
    assert.equal(stored?.questionnaireAnswers?.length, 4);
  });

  it("keeps the richer questionnaire payload when merging candidates", () => {
    const existing = baseCandidate({
      questionnaireAnswers: [{ question: "Old", answer: "No" }],
      hasQuestionnaire: true,
    });
    const incoming = baseCandidate({
      questionnaireAnswers: [
        { question: "Do you have reliable transportation?", answer: "Yes" },
        { question: "Do you have a smartphone?", answer: "Yes" },
      ],
      hasQuestionnaire: true,
    });
    const merged = mergeCandidateRecord(existing, incoming);
    assert.equal(merged.questionnaireAnswers?.length, 2);
    assert.equal(merged.questionnaireAnswers?.[0]?.question, "Do you have reliable transportation?");
  });

  it("builds questionnaire intelligence from enriched answers", () => {
    const candidate = applyQuestionnaireAnswersToCandidate(baseCandidate(), [
      { question: "Do you have reliable transportation?", answer: "Yes, can travel 50 miles" },
      { question: "Do you have a smartphone?", answer: "Yes" },
      { question: "Do you have internet access?", answer: "Yes" },
      { question: "Are you comfortable with mobile apps?", answer: "Yes" },
      { question: "Merchandising experience", answer: "3 years" },
    ]);
    const questionnaire = buildQuestionnaireIntelligence(candidate);
    assert.equal(questionnaire.available, true);
    assert.equal(questionnaire.techReady, true);
    assert.ok(questionnaire.availabilityNotes?.toLowerCase().includes("travel"));
  });

  it("does not mark transportation missing when questionnaire is absent", () => {
    const candidate = baseCandidate({ questionnaireAnswers: undefined, hasQuestionnaire: false });
    const resume = buildResumeIntelligence(candidate);
    const questionnaire = buildQuestionnaireIntelligence(candidate);
    const contributors = buildGradeContributors({ candidate, resume, questionnaire });
    assert.ok(!contributors.some((item) => item.label === "Transportation not confirmed"));
  });

  it("marks transportation missing only when questionnaire exists and travel is unanswered", () => {
    const candidate = applyQuestionnaireAnswersToCandidate(
      baseCandidate({
        resumeText: "Retail associate with customer service experience.",
        hasResume: true,
      }),
      [
        { question: "Do you have a smartphone?", answer: "Yes" },
        { question: "Do you have internet access?", answer: "Yes" },
        { question: "Are you comfortable with mobile apps?", answer: "Yes" },
      ],
    );
    const resume = buildResumeIntelligence(candidate);
    const questionnaire = buildQuestionnaireIntelligence(candidate);
    const contributors = buildGradeContributors({ candidate, resume, questionnaire });
    assert.ok(contributors.some((item) => item.label === "Transportation not confirmed"));
  });

  it("enriches candidate records from Breezy detail payloads", () => {
    const enriched = enrichBreezyCandidateWithQuestionnairePayload(baseCandidate(), {
      detail: null,
      questionnaires: [
        {
          questions: [
            { question: "Do you have reliable transportation?", answer: "Yes" },
            { question: "Do you have a smartphone?", answer: "Yes" },
            { question: "Do you have internet access?", answer: "Yes" },
            { question: "Are you comfortable with mobile apps?", answer: "Yes" },
            { question: "Merchandising experience", answer: "2 years" },
          ],
        },
      ],
      customFields: [],
      documents: null,
      resume: null,
    });
    assert.equal(enriched.hasQuestionnaire, true);
    assert.ok((enriched.questionnaireAnswers?.length ?? 0) >= 5);
  });

  it("improves P83 qualification data after questionnaire enrichment", () => {
    const jobsByPositionId = new Map([
      [
        "p1",
        {
          jobId: "p1",
          name: "Field Merchandiser",
          city: "Dallas",
          state: "TX",
          zip: "",
          displayLocation: "Dallas, TX",
          locationSource: "location" as const,
          status: "published",
          createdDate: "",
          updatedDate: "",
        },
      ],
    ]);
    const enriched = enrichBreezyCandidateWithQuestionnairePayload(
      baseCandidate({
        resumeText:
          "Retail merchandiser with Walmart reset experience. Customer service and phone support background. Travel willing 50 miles.",
        hasResume: true,
      }),
      {
        detail: null,
        questionnaires: [
          {
            questions: [
              { question: "Do you have reliable transportation?", answer: "Yes" },
              { question: "Do you have a smartphone?", answer: "Yes" },
              { question: "Do you have internet access?", answer: "Yes" },
              { question: "Are you comfortable with mobile apps?", answer: "Yes" },
              { question: "Merchandising experience", answer: "3 years" },
            ],
          },
        ],
        customFields: [],
        documents: null,
        resume: null,
      },
    );
    const row = buildScoredWorkflowRow(enriched, undefined, { job: jobsByPositionId.get("p1") });
    row.assignedRecruiter = "Taylor";
    const [decision] = buildCandidateAdvancementDecisions([row], {
      jobsByPositionId,
      paperworkByGrade: { "A+": true, A: true, B: true, C: true, D: true },
      requireApproval: false,
    });
    assert.notEqual(decision?.action, "call-first");
    assert.notEqual(decision?.reason, "Verification needed before paperwork: transportation.");
  });

  it("lists MTD candidates missing questionnaire answers", () => {
    const store = emptyIngestionStore();
    const merged = mergeIngestedCandidates(store, [
      baseCandidate({ candidateId: "june-1", appliedDate: "2026-06-05", hasQuestionnaire: false }),
      applyQuestionnaireAnswersToCandidate(
        baseCandidate({ candidateId: "june-2", appliedDate: "2026-06-06" }),
        [{ question: "Smartphone", answer: "Yes" }],
      ),
    ]);
    const missing = listMtdCandidatesMissingQuestionnaire(merged.store, new Date("2026-06-29"));
    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.candidateId, "june-1");
  });

  it("skips enriched candidates and previously attempted empty enrichments", () => {
    const enriched = applyQuestionnaireAnswersToCandidate(baseCandidate({ candidateId: "done" }), [
      { question: "Smartphone", answer: "Yes" },
    ]);
    const attemptedEmpty = baseCandidate({
      candidateId: "tried",
      questionnaireEnrichmentAttemptedAt: "2026-06-29T12:00:00.000Z",
      hasQuestionnaire: false,
    });
    assert.equal(candidatePendingQuestionnaireEnrichment(enriched), false);
    assert.equal(candidatePendingQuestionnaireEnrichment(attemptedEmpty), false);
    assert.equal(candidatePendingQuestionnaireEnrichment(baseCandidate({ candidateId: "pending" })), true);

    const store = emptyIngestionStore();
    const merged = mergeIngestedCandidates(store, [
      baseCandidate({ candidateId: "pending", appliedDate: "2026-06-05" }),
      enriched,
      attemptedEmpty,
    ]);
    const pending = listMtdCandidatesPendingQuestionnaireEnrichment(merged.store, new Date("2026-06-29"));
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.candidateId, "pending");
  });

  it("preserves questionnaire enrichment attempted timestamp when merging", () => {
    const merged = mergeCandidateRecord(undefined, {
      ...baseCandidate(),
      questionnaireEnrichmentAttemptedAt: "2026-06-29T12:00:00.000Z",
    });
    assert.equal(merged.questionnaireEnrichmentAttemptedAt, "2026-06-29T12:00:00.000Z");
  });

  it("returns candidate unchanged when enrichment payload has no answers", () => {
    const candidate = baseCandidate();
    const enriched = enrichBreezyCandidateWithQuestionnairePayload(candidate, {
      detail: null,
      questionnaires: [],
      customFields: [],
      documents: null,
      resume: null,
    });
    assert.equal(enriched.hasQuestionnaire, undefined);
    assert.equal(enriched.questionnaireAnswers?.length ?? 0, 0);
  });
});
