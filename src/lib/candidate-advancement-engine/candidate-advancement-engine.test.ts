import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyJob } from "@/lib/breezy-api";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import {
  buildCandidateAdvancementDecision,
  buildCandidateAdvancementDecisions,
} from "@/lib/candidate-advancement-engine";

const JOBS_BY_POSITION = new Map<string, BreezyJob>([
  [
    "pos-1",
    {
      jobId: "pos-1",
      name: "Merchandiser",
      state: "GA",
      city: "Atlanta",
      status: "published",
    } as BreezyJob,
  ],
]);

const DEFAULT_OPTIONS = {
  jobsByPositionId: JOBS_BY_POSITION,
  paperworkByGrade: { ...DEFAULT_PAPERWORK_BY_GRADE },
  requireApproval: false,
};

function baselineGrade(
  patch: Partial<ScoredCandidateWorkflowRow["candidateGrade"]> = {},
): ScoredCandidateWorkflowRow["candidateGrade"] {
  return {
    overallScore: 80,
    grade: "A",
    categoryScores: {
      retailMerchandisingExperience: 80,
      reliabilityReadiness: 80,
      technologyReadiness: 80,
      communicationReadiness: 80,
      projectFit: 80,
      paperworkReadiness: 80,
      riskFlags: 80,
    },
    strengths: ["Strong retail background"],
    concerns: [],
    recommendedNextAction: "Screen candidate",
    paperworkReady: true,
    techReady: true,
    confidence: "high",
    confidenceLabel: "High confidence",
    gradeContributors: [],
    ...patch,
  };
}

function mockRow(
  patch: Partial<ScoredCandidateWorkflowRow> & Pick<ScoredCandidateWorkflowRow, "candidateId" | "workflowStatus">,
): ScoredCandidateWorkflowRow {
  const candidateId = patch.candidateId;
  const aiGrade = patch.aiGrade ?? "A";
  return {
    candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: patch.stage ?? "Applied",
    appliedDate: "2026-06-22T10:00:00.000Z",
    createdDate: "2026-06-22T10:00:00.000Z",
    addedDate: "2026-06-22T10:00:00.000Z",
    updatedDate: "2026-06-22T10:00:00.000Z",
    addedDateSource: "creation_date",
    positionName: "Merchandiser",
    positionId: patch.positionId ?? "pos-1",
    city: "Atlanta",
    state: "GA",
    zipCode: "30301",
    hasResume: true,
    resumeText: "Walmart resets merchandising",
    workflowStatus: patch.workflowStatus,
    lastActionAt: null,
    nextActionNeeded: "Review candidate fit",
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: "not_sent",
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    suggestedDM: "Unassigned",
    dmNeedsAssignment: false,
    resumeKeywordScore: 70,
    merchandisingExperienceScore: 70,
    retailExperienceScore: 70,
    travelFitScore: 70,
    overallCandidateScore: 75,
    aiRecommendation: "Strong fit",
    aiGrade,
    aiNumericScore: 75,
    aiRecommendations: [],
    aiSummary: "Strong fit",
    aiBreakdown: {
      resumeSourceQuality: 10,
      merchandisingKeywords: 10,
      resetExperience: 10,
      walmartTargetExperience: 10,
      travelWillingness: 10,
      responseSignals: 10,
      questionnaireCompleteness: 10,
      locationFit: 10,
      availabilitySignals: 10,
    },
    ai: {
      letterGrade: aiGrade,
      numericScore: 75,
      summary: "Strong fit",
      recommendations: [],
      breakdown: {
        resumeSourceQuality: 10,
        merchandisingKeywords: 10,
        resetExperience: 10,
        walmartTargetExperience: 10,
        travelWillingness: 10,
        responseSignals: 10,
        questionnaireCompleteness: 10,
        locationFit: 10,
        availabilitySignals: 10,
      },
    },
    matchPercent: 78,
    matchLevel: "high",
    isTopMatch: true,
    skillTags: ["retail_merchandising"],
    distanceMiles: 10,
    intelligenceSummary: "Strong fit",
    intelligence: {
      matchPercent: 78,
      matchLevel: "high",
      isTopMatch: true,
      hasResume: true,
      skillTagLabels: ["retail_merchandising"],
      distanceMiles: 10,
      summary: "Strong fit",
      factors: {
        experience: 8,
        travelRadius: 100,
        responseSpeed: 80,
        resumeQuality: 8,
      },
    },
    resumeIntelligence: {
      available: true,
      summary: "Retail merchandising background",
      workHistoryHighlights: [],
      relevantSkills: [],
      signalBadges: [{ id: "retail", label: "Retail", detected: true }],
      phoneCustomerServiceExperience: true,
      merchandisingRetailExperience: true,
      employmentGaps: [],
      experienceFlags: [],
      quality: {
        employmentHistoryCount: 2,
        longestTenureMonths: 24,
        longestTenureLabel: "2 years",
        employmentGapsDetected: 0,
        completeness: "complete",
        completenessLabel: "Complete",
      },
    },
    questionnaireIntelligence: {
      available: true,
      answers: [],
      merchandisingExperience: "3 years",
      priorVendorExperience: null,
      smartphoneAccess: true,
      internetAccess: true,
      comfortableWithApps: true,
      printerLaptopAccess: true,
      photoUploadComfort: true,
      scheduleUnderstanding: true,
      availabilityNotes: null,
      techReady: true,
      missingAnswers: [],
      readinessChecks: [],
    },
    candidateGrade: baselineGrade({ grade: aiGrade === "D" ? "D" : "A", ...(patch.candidateGrade ?? {}) }),
    funnelAutomation: baselineCandidateFunnelAutomation(candidateId),
    ...patch,
  };
}

describe("candidate-advancement-engine", () => {
  it("advances qualified A-grade candidate to send-paperwork", () => {
    const decision = buildCandidateAdvancementDecision(
      mockRow({ candidateId: "c-1", workflowStatus: "Applied", actionType: "screen-candidate" }),
      DEFAULT_OPTIONS,
    );
    assert.equal(decision.action, "send-paperwork");
    assert.equal(decision.shouldAdvance, true);
    assert.equal(decision.shouldPersist, true);
    assert.ok(decision.reason.includes("P83"));
  });

  it("holds when published job match is missing", () => {
    const decision = buildCandidateAdvancementDecision(
      mockRow({ candidateId: "c-2", workflowStatus: "Applied" }),
      {
        ...DEFAULT_OPTIONS,
        jobsByPositionId: new Map(),
      },
    );
    assert.equal(decision.action, "hold");
    assert.equal(decision.shouldAdvance, false);
    assert.ok(decision.reason.toLowerCase().includes("job"));
  });

  it("recommends call-first when questionnaire technology readiness is unverified", () => {
    const decision = buildCandidateAdvancementDecision(
      mockRow({
        candidateId: "c-3",
        workflowStatus: "Needs Review",
        questionnaireIntelligence: {
          available: true,
          answers: [],
          merchandisingExperience: "2 years",
          priorVendorExperience: null,
          smartphoneAccess: false,
          internetAccess: true,
          comfortableWithApps: false,
          printerLaptopAccess: null,
          photoUploadComfort: null,
          scheduleUnderstanding: true,
          availabilityNotes: null,
          techReady: false,
          missingAnswers: [],
          readinessChecks: [],
        },
      }),
      DEFAULT_OPTIONS,
    );
    assert.equal(decision.action, "call-first");
    assert.equal(decision.shouldAdvance, false);
    assert.ok(decision.reason.toLowerCase().includes("technology"));
  });

  it("recommends reject without advancing for disqualified candidate", () => {
    const decision = buildCandidateAdvancementDecision(
      mockRow({
        candidateId: "c-4",
        workflowStatus: "Applied",
        aiGrade: "D",
        candidateGrade: baselineGrade({ grade: "D", confidence: "high" }),
      }),
      DEFAULT_OPTIONS,
    );
    assert.equal(decision.action, "reject");
    assert.equal(decision.shouldAdvance, false);
    assert.equal(decision.shouldPersist, true);
  });

  it("defers advancement when approval is required", () => {
    const decision = buildCandidateAdvancementDecision(
      mockRow({ candidateId: "c-5", workflowStatus: "Applied" }),
      { ...DEFAULT_OPTIONS, requireApproval: true },
    );
    assert.equal(decision.action, "send-paperwork");
    assert.equal(decision.shouldAdvance, false);
    assert.equal(decision.requiresApproval, true);
  });

  it("buildCandidateAdvancementDecisions returns one decision per candidate", () => {
    const rows = [mockRow({ candidateId: "c-6", workflowStatus: "Applied" })];
    assert.equal(buildCandidateAdvancementDecisions(rows, DEFAULT_OPTIONS).length, 1);
  });
});
