import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildP1933QuestionnaireRecord,
  unwrapQuestionnaireArray,
  classifyQuestionnaireState,
  projectQuestionnaireForClient,
  resolveQualificationField,
  assertQuestionnaireOnlyWrites,
  validateNoLifecycleSideEffects,
  P193_3_QUESTION_ID_MAP,
} from "@/lib/p193-3-questionnaire-capture";
import { extractQuestionnaireAnswersFromBreezyQuestionnaires } from "@/lib/candidate-readiness/questionnaire-parser";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { BreezyCandidate } from "@/lib/breezy-api";

const masterQuestionnaire = {
  _id: "q1",
  name: "Master Questionnaire 2025",
  questionnaire_id: "mq-2025",
  status: "completed",
  updated_date: "2026-07-01T00:00:00.000Z",
  sections: [
    {
      questions: [
        {
          _id: "87238e492c55",
          text: "Do you own an updated Android smartphone or iPhone that can run apps and access the internet reliably?",
          type: { id: "multiplechoice" },
          response: "Yes, iPhone",
        },
        {
          _id: "2b4398c4c976",
          text: "Do you have reliable internet access on your smartphone?",
          type: { id: "multiplechoice" },
          response: "Yes",
        },
        {
          _id: "b9032d6ad90c",
          text: "What types of resets have you completed? (Select all that apply)",
          type: { id: "checkboxes" },
          options: [{ text: "Simple shelf resets" }, { text: "Full aisle resets" }],
          responses: [true, false],
        },
      ],
    },
  ],
  questions: [],
};

describe("P193.3 questionnaire capture", () => {
  it("captures full questionnaire from Breezy detail+questionnaires shape", () => {
    const record = buildP1933QuestionnaireRecord({
      candidateId: "c1",
      positionId: "p1",
      payload: {
        detail: { questionnaire: masterQuestionnaire.sections[0]!.questions },
        questionnaires: [masterQuestionnaire],
        customFields: [],
      },
    });
    assert.equal(record.completionStatus, "completed");
    assert.ok(record.flatAnswers.length >= 3);
    assert.equal(record.mappedQualificationFields.smartphone_ownership, "Yes, iPhone");
    assert.equal(record.sourceSystem, "breezy");
    assert.ok(record.contentChecksum.length > 10);
  });

  it("unwraps nested questionnaire envelopes and parses answers", () => {
    const wrapped = { questionnaires: [masterQuestionnaire] };
    assert.equal(unwrapQuestionnaireArray(wrapped).length, 1);
    const answers = extractQuestionnaireAnswersFromBreezyQuestionnaires(wrapped);
    assert.ok(answers.length >= 2);
  });

  it("maps by question ID and falls back to normalized text", () => {
    assert.equal(P193_3_QUESTION_ID_MAP["87238e492c55"], "smartphone_ownership");
    const byId = resolveQualificationField({
      questionId: "87238e492c55",
      questionText: "irrelevant",
    });
    assert.equal(byId.mappedBy, "question_id");
    const byText = resolveQualificationField({
      questionId: null,
      questionText: "Do you have reliable transportation, a valid driver’s license, and are you 18?",
    });
    assert.equal(byText.field, "transportation_license_age");
    assert.equal(byText.mappedBy, "normalized_text");
  });

  it("classifies complete-in-breezy missing locally vs incomplete", () => {
    const candidate = {
      candidateId: "c2",
      positionId: "p1",
      hasQuestionnaire: false,
      questionnaireAnswers: [],
    } as unknown as BreezyCandidate;
    const breezy = buildP1933QuestionnaireRecord({
      candidateId: "c2",
      positionId: "p1",
      payload: { questionnaires: [masterQuestionnaire] },
    });
    assert.equal(
      classifyQuestionnaireState({
        candidate,
        breezyRecord: breezy,
        localRecord: null,
        questionnaireCount: 1,
      }),
      "questionnaire_complete_in_breezy_missing_locally",
    );

    const empty = buildP1933QuestionnaireRecord({
      candidateId: "c3",
      positionId: "p1",
      payload: { questionnaires: [] },
    });
    assert.equal(
      classifyQuestionnaireState({
        candidate: { ...candidate, candidateId: "c3" } as BreezyCandidate,
        breezyRecord: empty,
        localRecord: null,
        questionnaireCount: 0,
      }),
      "questionnaire_incomplete_in_breezy",
    );
  });

  it("handles malformed / empty answers without throwing", () => {
    const record = buildP1933QuestionnaireRecord({
      candidateId: "c4",
      positionId: "p1",
      payload: {
        questionnaires: [{ name: "Broken", status: "completed", sections: [{ questions: [null, 5, {}] }] }],
      },
    });
    assert.ok(record);
    assert.equal(record.flatAnswers.length, 0);
  });

  it("checksum idempotency distinguishes changed answers", () => {
    const a = buildP1933QuestionnaireRecord({
      candidateId: "c5",
      positionId: "p1",
      payload: { questionnaires: [masterQuestionnaire] },
    });
    const altered = {
      ...masterQuestionnaire,
      sections: [
        {
          questions: [
            {
              ...masterQuestionnaire.sections[0]!.questions[0],
              response: "Yes, Android",
            },
          ],
        },
      ],
    };
    const b = buildP1933QuestionnaireRecord({
      candidateId: "c5",
      positionId: "p1",
      payload: { questionnaires: [altered] },
    });
    assert.notEqual(a.contentChecksum, b.contentChecksum);
  });

  it("client projection stays serializable without filesystem fields", () => {
    const record = buildP1933QuestionnaireRecord({
      candidateId: "c6",
      positionId: "p1",
      payload: { questionnaires: [masterQuestionnaire] },
    });
    const view = projectQuestionnaireForClient({ candidateId: "c6", record });
    assert.equal(view.hasQuestionnaire, true);
    assert.ok(view.answersPreview.length > 0);
    assert.equal(JSON.parse(JSON.stringify(view)).candidateId, "c6");
  });

  it("guards forbid MEL, paperwork, reminders, P192 restart, lifecycle writes", () => {
    const writes = assertQuestionnaireOnlyWrites({
      melWrites: 0,
      paperworkSends: 0,
      reminderSends: 0,
      p192Restarted: false,
      p193GlobalEnabled: false,
    });
    assert.equal(writes.ok, true);
    const bad = assertQuestionnaireOnlyWrites({
      melWrites: 1,
      paperworkSends: 1,
      reminderSends: 1,
      p192Restarted: true,
      p193GlobalEnabled: true,
    });
    assert.equal(bad.ok, false);

    const before: Record<string, CandidateWorkflowRecord> = {
      c1: {
        candidateId: "c1",
        workflowStatus: "Applied",
        notes: [],
        assignedRecruiter: "Unassigned",
        paperworkStatus: "not_sent",
        signatureRequestId: null,
        paperworkSentAt: null,
        history: [],
      } as CandidateWorkflowRecord,
    };
    const after = {
      c1: { ...before.c1!, workflowStatus: "Paperwork Needed" as const },
    };
    const lifecycle = validateNoLifecycleSideEffects({
      workflowsBefore: before,
      workflowsAfter: after,
      touchedCandidateIds: ["c1"],
    });
    assert.equal(lifecycle.ok, false);
  });

  it("supports multiple questionnaire versions via text fallback", () => {
    const alt = {
      name: "Master Questionnaire",
      status: "completed",
      questions: [
        {
          text: "Are you comfortable installing and using third-party apps?",
          response: "Yes",
        },
      ],
    };
    const record = buildP1933QuestionnaireRecord({
      candidateId: "c7",
      positionId: "p1",
      payload: { questionnaires: [alt] },
    });
    assert.equal(record.mappedQualificationFields.comfort_installing_apps, "Yes");
  });
});
