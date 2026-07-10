import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateIntelligenceBundle,
  buildCandidateReadinessScore,
  buildQuestionnaireIntelligence,
  buildResumeIntelligence,
  extractQuestionnaireAnswersFromRaw,
  matchesCandidateIntelligenceFilter,
} from "@/lib/candidate-readiness";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-05-01",
    createdDate: "2026-05-01",
    addedDate: "2026-05-01",
    updatedDate: "2026-05-01",
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
      { question: "Merchandising experience", answer: "3 years" },
      { question: "Prior vendor experience", answer: "SRS, Acosta" },
      { question: "Do you have a printer or laptop?", answer: "No" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

describe("candidate-readiness", () => {
  it("prefers first and last name over email for display", () => {
    assert.equal(
      formatCandidateDisplayName({ firstName: "Alex", lastName: "Rivera", email: "alex@example.com" }),
      "Alex Rivera",
    );
    assert.equal(
      formatCandidateDisplayName({ firstName: "", lastName: "", email: "alex@example.com" }),
      "alex@example.com",
    );
  });

  it("extracts questionnaire answers from Breezy custom attributes", () => {
    const answers = extractQuestionnaireAnswersFromRaw({
      custom_attributes: [
        { name: "Smartphone access", value: "Yes" },
        { name: "Internet access", value: "Yes" },
      ],
    });
    assert.equal(answers.length, 2);
    assert.equal(answers[0]?.question, "Smartphone access");
  });

  it("extracts Breezy detail questionnaire text/response and checkbox fields", () => {
    const answers = extractQuestionnaireAnswersFromRaw({
      questionnaire: [
        {
          text: "How many years of professional merchandising experience do you have?",
          response: "1–2 years",
        },
        {
          text: "What types of resets have you completed? (Select all that apply)",
          options: [{ text: "Simple shelf resets" }, { text: "Full aisle resets" }],
          responses: [true, true],
        },
      ],
    });
    assert.equal(answers.length, 2);
    assert.equal(answers[0]?.question, "How many years of professional merchandising experience do you have?");
    assert.equal(answers[0]?.answer, "1–2 years");
    assert.equal(answers[1]?.answer, "Simple shelf resets, Full aisle resets");
    assert.ok(!answers.some((entry) => entry.answer === entry.question));
  });

  it("builds resume intelligence with quick-read signal badges", () => {
    const resume = buildResumeIntelligence(sampleCandidate());
    assert.equal(resume.available, true);
    assert.equal(resume.merchandisingRetailExperience, true);
    assert.equal(resume.phoneCustomerServiceExperience, true);
    assert.ok(resume.signalBadges.some((badge) => badge.id === "retail" && badge.detected));
    assert.ok(resume.signalBadges.some((badge) => badge.id === "cash_handling" && badge.detected));
    assert.ok(resume.workHistoryHighlights.length > 0);
  });

  it("shows not available when resume is missing", () => {
    const resume = buildResumeIntelligence(
      sampleCandidate({ resumeText: "", hasResume: false, resumeFields: undefined }),
    );
    assert.equal(resume.available, false);
    assert.ok(resume.experienceFlags.some((flag) => flag.includes("Not available")));
  });

  it("builds questionnaire intelligence with tech readiness", () => {
    const questionnaire = buildQuestionnaireIntelligence(sampleCandidate());
    assert.equal(questionnaire.available, true);
    assert.equal(questionnaire.techReady, true);
    assert.equal(questionnaire.smartphoneAccess, true);
    assert.equal(questionnaire.printerLaptopAccess, false);
  });

  it("treats missing questionnaire as neutral in scoring", () => {
    const candidate = sampleCandidate({ questionnaireAnswers: undefined, hasQuestionnaire: false });
    const resume = buildResumeIntelligence(candidate);
    const questionnaire = buildQuestionnaireIntelligence(candidate);
    const grade = buildCandidateReadinessScore({
      candidate,
      resume,
      questionnaire,
      resumeHaystack: candidate.resumeText.toLowerCase(),
    });

    assert.ok(grade.overallScore >= 58);
    assert.ok(["A", "B", "C"].includes(grade.grade));
    assert.equal(questionnaire.techReady, null);
    assert.ok(!grade.concerns.some((item) => item.includes("Breezy")));
    assert.ok(!grade.recommendedNextAction.toLowerCase().includes("breezy"));
  });

  it("scores strong retail candidate with actionable recommendation", () => {
    const candidate = sampleCandidate();
    const resume = buildResumeIntelligence(candidate);
    const questionnaire = buildQuestionnaireIntelligence(candidate);
    const grade = buildCandidateReadinessScore({
      candidate,
      resume,
      questionnaire,
      resumeHaystack: candidate.resumeText.toLowerCase(),
    });

    assert.ok(grade.overallScore >= 58);
    assert.ok(["A", "B", "C"].includes(grade.grade));
    assert.ok(grade.strengths.some((s) => s.toLowerCase().includes("retail")));
    assert.ok(grade.recommendedNextAction.includes("555-0100") || grade.recommendedNextAction.includes("Call"));
  });

  it("uses custom attribute text when structured questionnaire answers are absent", () => {
    const questionnaire = buildQuestionnaireIntelligence(
      sampleCandidate({
        questionnaireAnswers: undefined,
        resumeFields: {
          customAttributesText: "Smartphone access Yes Internet access Yes Merchandising experience 2 years",
        },
      }),
    );
    assert.equal(questionnaire.available, true);
    assert.ok(questionnaire.answers.length > 0);
  });

  it("matches intelligence filters on scored workflow rows", () => {
    const row = buildScoredWorkflowRow(sampleCandidate());
    assert.equal(matchesCandidateIntelligenceFilter(row, "tech-ready"), true);
    assert.equal(matchesCandidateIntelligenceFilter(row, "retail-experience"), true);
    assert.equal(matchesCandidateIntelligenceFilter(row, "missing-resume"), false);
    assert.equal(matchesCandidateIntelligenceFilter(row, "missing-questionnaire"), false);
  });

  it("builds full intelligence bundle", () => {
    const bundle = buildCandidateIntelligenceBundle(sampleCandidate());
    assert.equal(bundle.resume.available, true);
    assert.equal(bundle.questionnaire.available, true);
    assert.ok(bundle.grade.overallScore > 0);
    assert.equal(bundle.grade.confidence, "high");
    assert.ok(bundle.grade.gradeContributors.some((item) => item.kind === "positive"));
    assert.ok(bundle.resume.quality.employmentHistoryCount !== null);
  });

  it("does not flag transportation when questionnaire is unavailable", () => {
    const candidate = sampleCandidate({ questionnaireAnswers: undefined, hasQuestionnaire: false });
    const bundle = buildCandidateIntelligenceBundle(candidate);
    assert.ok(
      !bundle.grade.gradeContributors.some((item) => item.label === "Transportation not confirmed"),
    );
  });

  it("exposes confidence and grade contributors", () => {
    const candidate = sampleCandidate({ questionnaireAnswers: undefined, hasQuestionnaire: false });
    const bundle = buildCandidateIntelligenceBundle(candidate);
    assert.equal(bundle.grade.confidence, "medium");
    assert.ok(bundle.grade.gradeContributors.some((item) => item.label.includes("Retail")));
  });
});
