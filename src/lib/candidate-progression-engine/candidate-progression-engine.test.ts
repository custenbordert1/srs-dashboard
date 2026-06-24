import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import {
  buildCandidateProgressionDecision,
  buildCandidateProgressionDecisions,
  compareProgressionPriority,
} from "@/lib/candidate-progression-engine";

const REFERENCE_MS = Date.parse("2026-06-23T15:00:00.000Z");

function mockRow(
  patch: Partial<ScoredCandidateWorkflowRow> & Pick<ScoredCandidateWorkflowRow, "candidateId" | "workflowStatus">,
): ScoredCandidateWorkflowRow {
  const candidateId = patch.candidateId;
  return {
    candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: patch.stage ?? "Applied",
    appliedDate: patch.appliedDate ?? "2026-06-22T10:00:00.000Z",
    createdDate: "2026-06-22T10:00:00.000Z",
    addedDate: "2026-06-22T10:00:00.000Z",
    updatedDate: "2026-06-22T10:00:00.000Z",
    addedDateSource: "creation_date",
    positionName: "Merchandiser",
    positionId: "pos-1",
    city: "Atlanta",
    state: "GA",
    zipCode: "30301",
    hasResume: true,
    resumeText: "Walmart resets merchandising",
    workflowStatus: patch.workflowStatus,
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? "Review candidate fit",
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: patch.assignedDM ?? "Unassigned",
    notes: [],
    history: [],
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: null,
    signatureRequestId: patch.signatureRequestId ?? null,
    paperworkTemplateKey: patch.paperworkTemplateKey ?? null,
    paperworkSentAt: patch.paperworkSentAt ?? null,
    paperworkViewedAt: patch.paperworkViewedAt ?? null,
    paperworkViewCount: patch.paperworkViewCount ?? 0,
    paperworkSignedAt: patch.paperworkSignedAt ?? null,
    paperworkStatus: patch.paperworkStatus ?? "not_sent",
    paperworkError: null,
    onboardingContactEmail: patch.onboardingContactEmail ?? null,
    directDepositStatus: patch.directDepositStatus ?? "not_requested",
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
    aiGrade: patch.aiGrade ?? "A",
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
      letterGrade: patch.aiGrade ?? "A",
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
    matchPercent: patch.matchPercent ?? 78,
    matchLevel: "high",
    isTopMatch: patch.isTopMatch ?? true,
    skillTags: ["retail_merchandising"],
    distanceMiles: 10,
    intelligenceSummary: "Strong fit",
    intelligence: {
      matchPercent: patch.matchPercent ?? 78,
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
      keywordHits: [],
      experienceYears: 3,
      retailBrands: ["Walmart"],
      merchandisingSignals: ["resets"],
      summary: "Retail merchandising background",
    },
    questionnaireIntelligence: {
      techReady: true,
      transportationConfirmed: true,
      overnightTravelOk: true,
      summary: "Ready",
      missingItems: [],
    },
    candidateGrade: {
      overallScore: 80,
      grade: patch.aiGrade ?? "A",
      paperworkReady: false,
      techReady: true,
      recommendedNextAction: "Screen candidate",
      summaryBullets: [],
    },
    funnelAutomation: baselineCandidateFunnelAutomation(candidateId),
    ...patch,
  };
}

describe("candidate-progression-engine", () => {
  it("recommends contact candidate for strong new applicant", () => {
    const decision = buildCandidateProgressionDecision(
      mockRow({ candidateId: "c-1", workflowStatus: "Applied" }),
      REFERENCE_MS,
    );
    assert.equal(decision.recommendedStage, "Contact Candidate");
    assert.equal(decision.progressionPriority, "high");
    assert.ok(decision.progressionReason.toLowerCase().includes("high confidence"));
    assert.equal(decision.shouldPersist, true);
  });

  it("skips progression for weak applicant", () => {
    const decision = buildCandidateProgressionDecision(
      mockRow({
        candidateId: "c-2",
        workflowStatus: "Applied",
        aiGrade: "D",
        matchPercent: 35,
        isTopMatch: false,
      }),
      REFERENCE_MS,
    );
    assert.equal(decision.shouldPersist, false);
    assert.equal(decision.progressionStageType, "none");
  });

  it("recommends send paperwork for interview-ready candidate", () => {
    const decision = buildCandidateProgressionDecision(
      mockRow({ candidateId: "c-3", workflowStatus: "Qualified" }),
      REFERENCE_MS,
    );
    assert.equal(decision.recommendedStage, "Send Paperwork");
    assert.equal(decision.progressionPriority, "high");
  });

  it("recommends ready for mel when paperwork is complete", () => {
    const decision = buildCandidateProgressionDecision(
      mockRow({
        candidateId: "c-4",
        workflowStatus: "Signed",
        paperworkStatus: "signed",
        paperworkSignedAt: "2026-06-22T12:00:00.000Z",
      }),
      REFERENCE_MS,
    );
    assert.equal(decision.recommendedStage, "Ready For MEL");
    assert.ok(decision.progressionReason.toLowerCase().includes("paperwork"));
  });

  it("recommends escalate for stalled needs-review candidate", () => {
    const decision = buildCandidateProgressionDecision(
      mockRow({
        candidateId: "c-5",
        workflowStatus: "Needs Review",
        stage: "Needs Review",
        appliedDate: "2026-06-01T10:00:00.000Z",
        lastActionAt: null,
        aiGrade: "C",
        matchPercent: 50,
        isTopMatch: false,
      }),
      REFERENCE_MS,
    );
    assert.equal(decision.recommendedStage, "Escalate");
    assert.equal(decision.progressionPriority, "high");
    assert.ok(decision.progressionReason.toLowerCase().includes("sla"));
  });

  it("recommends schedule interview after contact completed", () => {
    const decision = buildCandidateProgressionDecision(
      mockRow({
        candidateId: "c-6",
        workflowStatus: "Needs Review",
        lastActionAt: "2026-06-23T10:00:00.000Z",
      }),
      REFERENCE_MS,
    );
    assert.equal(decision.recommendedStage, "Schedule Interview");
    assert.ok(decision.progressionReason.toLowerCase().includes("contact"));
  });

  it("sorts high priority before low priority", () => {
    const highFirst = compareProgressionPriority(
      { progressionPriority: "high", progressionConfidence: 80 },
      { progressionPriority: "low", progressionConfidence: 90 },
    );
    assert.ok(highFirst < 0);
  });

  it("buildCandidateProgressionDecisions returns one decision per candidate", () => {
    const rows = [mockRow({ candidateId: "c-7", workflowStatus: "Applied" })];
    assert.equal(buildCandidateProgressionDecisions(rows, REFERENCE_MS).length, 1);
  });
});
