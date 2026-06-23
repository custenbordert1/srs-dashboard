import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import {
  buildRecruiterActionDecision,
  buildRecruiterActionDecisions,
  compareRecruiterActionPriority,
  isActionDueToday,
} from "@/lib/recruiter-action-engine";

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
    appliedDate: "2026-06-22T10:00:00.000Z",
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
    aiGrade: "A",
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
      letterGrade: "A",
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
      grade: "A",
      paperworkReady: false,
      techReady: true,
      recommendedNextAction: "Screen candidate",
      summaryBullets: [],
    },
    funnelAutomation: baselineCandidateFunnelAutomation(candidateId),
    ...patch,
  };
}

describe("recruiter-action-engine", () => {
  it("recommends screen candidate for new assigned applicant with qualifying score", () => {
    const decision = buildRecruiterActionDecision(
      mockRow({ candidateId: "c-1", workflowStatus: "Applied" }),
      REFERENCE_MS,
    );
    assert.equal(decision.requiredAction, "Screen Candidate");
    assert.equal(decision.actionPriority, "high");
    assert.ok(decision.actionReason.toLowerCase().includes("qualifying"));
    assert.equal(isActionDueToday(decision.actionDueDate, REFERENCE_MS), true);
    assert.equal(decision.shouldPersist, true);
  });

  it("recommends needs review for needs-review status without touch", () => {
    const decision = buildRecruiterActionDecision(
      mockRow({ candidateId: "c-2", workflowStatus: "Needs Review", stage: "Needs Review" }),
      REFERENCE_MS,
    );
    assert.equal(decision.requiredAction, "Needs Review");
    assert.equal(decision.actionPriority, "high");
  });

  it("recommends schedule interview when interview flag is set", () => {
    const decision = buildRecruiterActionDecision(
      mockRow({
        candidateId: "c-3",
        workflowStatus: "Qualified",
        recruitingActions: { ...emptyRecruitingActions(), recommendInterview: true },
      }),
      REFERENCE_MS,
    );
    assert.equal(decision.requiredAction, "Schedule Interview");
    assert.equal(decision.actionPriority, "high");
  });

  it("recommends send paperwork for paperwork needed status", () => {
    const decision = buildRecruiterActionDecision(
      mockRow({ candidateId: "c-4", workflowStatus: "Paperwork Needed" }),
      REFERENCE_MS,
    );
    assert.equal(decision.requiredAction, "Send Paperwork");
    assert.ok(decision.actionReason.toLowerCase().includes("paperwork"));
  });

  it("recommends await signature for paperwork sent yesterday", () => {
    const decision = buildRecruiterActionDecision(
      mockRow({
        candidateId: "c-5",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        paperworkSentAt: "2026-06-22T10:00:00.000Z",
        signatureRequestId: "sig-1",
      }),
      REFERENCE_MS,
    );
    assert.equal(decision.requiredAction, "Await Signature");
    assert.equal(decision.actionPriority, "medium");
  });

  it("recommends load mel for ready for mel status", () => {
    const decision = buildRecruiterActionDecision(
      mockRow({ candidateId: "c-6", workflowStatus: "Ready for MEL", paperworkStatus: "signed" }),
      REFERENCE_MS,
    );
    assert.equal(decision.requiredAction, "Load into MEL");
    assert.equal(decision.actionPriority, "high");
  });

  it("skips terminal hired candidate", () => {
    const decision = buildRecruiterActionDecision(
      mockRow({ candidateId: "c-7", workflowStatus: "Active Rep", stage: "Active Rep" }),
      REFERENCE_MS,
    );
    assert.equal(decision.shouldPersist, false);
    assert.equal(decision.actionType, "none");
  });

  it("sorts overdue before due today before high priority", () => {
    const overdue = compareRecruiterActionPriority(
      { actionDueDate: "2026-06-20", actionPriority: "low" },
      { actionDueDate: "2026-06-23", actionPriority: "high" },
      REFERENCE_MS,
    );
    assert.ok(overdue < 0);

    const todayBeforeMedium = compareRecruiterActionPriority(
      { actionDueDate: "2026-06-23", actionPriority: "medium" },
      { actionDueDate: "2026-06-25", actionPriority: "high" },
      REFERENCE_MS,
    );
    assert.ok(todayBeforeMedium < 0);
  });

  it("buildRecruiterActionDecisions returns one decision per candidate", () => {
    const rows = [mockRow({ candidateId: "c-8", workflowStatus: "Applied" })];
    assert.equal(buildRecruiterActionDecisions(rows, REFERENCE_MS).length, 1);
  });
});
