import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
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
      "Retail merchandiser with Walmart reset experience. Customer service and phone support background. 2019-2021 Walmart. 2023-2025 Target merchandising.",
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

describe("candidate-intelligence", () => {
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

  it("builds resume intelligence from Breezy resume fields", () => {
    const resume = buildResumeIntelligence(sampleCandidate());
    assert.equal(resume.available, true);
    assert.equal(resume.merchandisingRetailExperience, true);
    assert.equal(resume.phoneCustomerServiceExperience, true);
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

  it("scores candidate with grade, strengths, and concerns", () => {
    const candidate = sampleCandidate();
    const resume = buildResumeIntelligence(candidate);
    const questionnaire = buildQuestionnaireIntelligence(candidate);
    const grade = buildCandidateReadinessScore({
      candidate,
      resume,
      questionnaire,
      resumeHaystack: candidate.resumeText.toLowerCase(),
    });

    assert.ok(grade.overallScore >= 55);
    assert.ok(["A", "B", "C"].includes(grade.grade));
    assert.ok(grade.strengths.some((s) => s.includes("smartphone")));
    assert.ok(grade.concerns.some((c) => c.includes("printer") || c.includes("computer")));
    assert.ok(grade.recommendedNextAction.length > 0);
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
  });
});
