import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import type { CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";
import {
  evaluateInitialPaperworkEligibility,
  executeInitialPaperworkAutoSend,
  isP147InitialPaperworkAutoSendEnabled,
  P147_INITIAL_CONFIDENCE_MIN,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import { evaluatePaperworkCandidate } from "@/lib/recruiting/paperwork-automation-engine";
import type { PaperworkAutomationContext } from "@/lib/recruiting/paperwork-automation-engine";

function mockRow(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  const candidateId = overrides.candidateId ?? "c-1";
  return {
    candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    positionId: "pos-1",
    positionName: "Merchandiser",
    stage: "applied",
    appliedDate: new Date().toISOString(),
    workflowStatus: "Paperwork Needed",
    assignedRecruiter: "Taylor",
    assignedDM: "DM-1",
    hasResume: true,
    matchPercent: 82,
    isTopMatch: true,
    distanceMiles: 12,
    aiGrade: "B",
    nextActionNeeded: "Send paperwork",
    paperworkStatus: "not_sent",
    actionType: "send-paperwork",
    actionGeneratedAt: new Date().toISOString(),
    recruitingActions: emptyRecruitingActions(),
    notes: [],
    history: [],
    questionnaireIntelligence: { techReady: true, available: true },
    resumeIntelligence: { relevantSkills: ["reset"], signalBadges: [] },
    candidateGrade: {
      overallScore: 80,
      grade: "B",
      categoryScores: {
        retailMerchandisingExperience: 80,
        reliabilityReadiness: 80,
        technologyReadiness: 80,
        communicationReadiness: 80,
        projectFit: 80,
        paperworkReadiness: 80,
        riskFlags: 80,
      },
      strengths: [],
      concerns: [],
      recommendedNextAction: "Send paperwork",
      paperworkReady: true,
      techReady: true,
      confidence: "high",
      confidenceLabel: "High",
      gradeContributors: [],
    },
    intelligence: { factors: { responseSpeed: 80 } },
    aiBreakdown: { merchandisingKeywords: 8, stageProgression: 70 },
    funnelAutomation: baselineCandidateFunnelAutomation(candidateId),
    dmNeedsAssignment: false,
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

const publishedJob: BreezyJob = {
  jobId: "pos-1",
  name: "Massena Merchandiser",
  city: "Massena",
  state: "NY",
  status: "published",
  createdDate: "2026-01-01",
  updatedDate: "2026-01-01",
  zip: "",
  displayLocation: "Massena, NY",
  locationSource: "location",
};

function mockAdvancement(overrides: Partial<CandidateAdvancementEvaluation> = {}): CandidateAdvancementEvaluation {
  return {
    candidateId: "c-1",
    candidateName: "Alex Rivera",
    confidence: 95,
    nextAction: "Send Paperwork",
    blockers: [],
    advancementScore: 88,
    estimatedHireProbability: 75,
    urgency: "medium",
    automationEligible: false,
    automationExplanation: "test",
    reason: "Ready",
    recommendedRecruiterAction: "Send paperwork",
    recruiter: "Taylor",
    dm: "DM-1",
    workflowStatus: "Paperwork Needed",
    stageAgeDays: 1,
    scoreFactors: {} as CandidateAdvancementEvaluation["scoreFactors"],
    positionName: "Merchandiser",
    projectName: "Massena Merchandiser",
    coverageNeedScore: 70,
    automationPreviewApproved: null,
    automationPreviewRejected: null,
    ...overrides,
  } as CandidateAdvancementEvaluation;
}

function initialContext(): PaperworkAutomationContext {
  const jobsByPositionId = new Map([[publishedJob.jobId, publishedJob]]);
  return {
    row: mockRow(),
    jobsByPositionId,
    onboarding: null,
  };
}

describe("recruiting/initial-paperwork-execution-engine", () => {
  it("defaults initial auto-send to disabled", () => {
    assert.equal(isP147InitialPaperworkAutoSendEnabled({ P147_INITIAL_PAPERWORK_AUTO_SEND_ENABLED: "false" }), false);
    assert.equal(isP147InitialPaperworkAutoSendEnabled({}), false);
  });

  it("requires P144 Send Paperwork and high confidence", () => {
    const context = initialContext();
    const item = evaluatePaperworkCandidate(context);
    assert.ok(item);

    const eligible = evaluateInitialPaperworkEligibility({
      context,
      advancement: mockAdvancement(),
      auditEvents: [],
    });
    assert.equal(eligible.eligible, true);

    const lowConfidence = evaluateInitialPaperworkEligibility({
      context,
      advancement: mockAdvancement({ confidence: P147_INITIAL_CONFIDENCE_MIN - 1 }),
      auditEvents: [],
    });
    assert.equal(lowConfidence.eligible, false);
  });

  it("prevents duplicate initial paperwork via audit log", () => {
    const context = initialContext();
    const eligibility = evaluateInitialPaperworkEligibility({
      context,
      advancement: mockAdvancement(),
      auditEvents: [
        {
          id: "audit-1",
          at: new Date().toISOString(),
          type: "initial_paperwork_sent",
          userId: "u1",
          userEmail: "u1@test.com",
          candidateId: "c-1",
          project: "Merchandiser",
          recommendedAction: "Send Initial Paperwork",
          reason: "sent",
          executed: true,
          simulated: false,
          sendResult: "sent",
        },
      ],
    });
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.duplicatePrevented, true);
  });

  it("dry run does not mark paperwork sent when disabled", async () => {
    const context = initialContext();
    const summary = await executeInitialPaperworkAutoSend({
      contexts: [context],
      advancements: [mockAdvancement()],
      auditEvents: [],
      onboardingPolicy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      dryRun: true,
      autoSendEnabled: false,
      userId: "test",
      userEmail: "test@example.com",
    });

    assert.equal(summary.dryRun, true);
    assert.equal(summary.autoSendEnabled, false);
    assert.equal(summary.paperworkSent, false);
    assert.equal(summary.breezyWrites, false);
    assert.equal(summary.executeBatchCalled, false);
    assert.ok(summary.executionTimeMs >= 0);
  });
});
