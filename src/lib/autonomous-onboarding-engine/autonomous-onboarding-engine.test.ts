import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTONOMOUS_ONBOARDING_TRANSITIONS,
  buildOnboardingExecutiveProgressMetrics,
  buildOnboardingProgressSummary,
  buildReadyForWorkReadiness,
  buildTrainingAssignmentPreview,
  buildWelcomeEmailPreview,
  formatElapsedSince,
  hooksForState,
  listAutomationHookDefinitions,
  listOnboardingProgressStepDefinitions,
  listTrainingModules,
  resolveAutonomousOnboardingState,
  runAutonomousOnboardingPreview,
  stateLabel,
} from "@/lib/autonomous-onboarding-engine";
import { buildOnboardingStallAssessment } from "@/lib/autonomous-onboarding-engine/build-onboarding-activity-intelligence";
import { buildOnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

function sampleRow(
  candidateId: string,
  patch: Partial<OnboardingPreviewCandidateInput> = {},
): OnboardingPreviewCandidateInput {
  return {
    candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: `${candidateId}@example.com`,
    appliedDate: "2026-06-01T12:00:00.000Z",
    workflowStatus: "Paperwork Sent",
    paperworkStatus: "sent",
    paperworkError: null,
    paperworkSentAt: "2026-06-10T12:00:00.000Z",
    paperworkSignedAt: null,
    signatureRequestId: "sig-1",
    assignedRecruiter: "Jordan Lee",
    ...patch,
  };
}

function scoredRowFromPreview(input: OnboardingPreviewCandidateInput): ScoredCandidateWorkflowRow {
  return {
    ...input,
    phone: "555-0100",
    source: "Indeed",
    stage: "offer",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    createdDate: input.appliedDate,
    addedDate: input.appliedDate,
    updatedDate: input.appliedDate,
    addedDateSource: "creation_date",
    resumeText: "",
    hasResume: false,
    lastActionAt: null,
    nextActionNeeded: "Wait",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    recruitingActions: {
      dmReview: false,
      recommendInterview: false,
      needsFollowUp: false,
      priorityList: false,
      onboardingPacketPrep: false,
      updatedAt: input.appliedDate,
    },
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkTemplateKey: "onboarding_packet",
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    onboardingContactEmail: input.email,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    suggestedDM: "Unassigned",
    dmNeedsAssignment: true,
    resumeKeywordScore: null,
    merchandisingExperienceScore: null,
    retailExperienceScore: null,
    travelFitScore: null,
    strengths: [],
    concerns: [],
    suggestedProjects: [],
    bestFit: false,
    tierLabel: "B",
    extractedKeywords: [],
    recommendedNextAction: "Wait",
    overallCandidateScore: 80,
    aiRecommendation: "Proceed",
    aiGrade: "B",
    aiNumericScore: 80,
    aiRecommendations: [],
    aiBreakdown: {
      resumeKeywords: 0,
      merchandisingExperience: 0,
      retailExperience: 0,
      travelFit: 0,
      questionnaire: 0,
      overall: 80,
    },
    requiredAction: null,
    actionType: null,
    actionPriority: null,
    actionReason: null,
    actionDueDate: null,
    actionConfidence: null,
    actionGeneratedAt: null,
    recommendedStage: null,
    progressionReason: null,
    progressionConfidence: null,
    progressionPriority: null,
    progressionGeneratedAt: null,
    candidateGrade: "B",
    readinessScore: null,
    intelligenceScore: null,
    matchLevel: "medium",
    funnelAutomation: {
      copilot: { summary: "", bullets: [] },
      automationLevel: "manual",
      triggers: [],
    },
    resumeIntelligence: null,
    questionnaireIntelligence: null,
    recruiterAssignmentSource: null,
    recruiterAssignmentReason: null,
    recruiterAssignmentConfidence: null,
  } as ScoredCandidateWorkflowRow;
}

describe("autonomous-onboarding-engine", () => {
  it("resolves paperwork sent and signed states deterministically", () => {
    assert.equal(
      resolveAutonomousOnboardingState({
        candidateId: "c-1",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
      }),
      "paperwork_sent",
    );
    assert.equal(
      resolveAutonomousOnboardingState({
        candidateId: "c-2",
        workflowStatus: "Signed",
        paperworkStatus: "signed",
      }),
      "welcome_prepared",
    );
    assert.equal(
      resolveAutonomousOnboardingState({
        candidateId: "c-3",
        workflowStatus: "Active Rep",
        paperworkStatus: "signed",
        trainingComplete: true,
        acknowledgementsComplete: true,
      }),
      "assigned",
    );
  });

  it("defines auditable state transitions", () => {
    assert.ok(AUTONOMOUS_ONBOARDING_TRANSITIONS.length >= 8);
    assert.ok(AUTONOMOUS_ONBOARDING_TRANSITIONS.every((row) => row.auditable));
  });

  it("lists extensible training modules beyond hardcoded pair", () => {
    const modules = listTrainingModules();
    assert.ok(modules.length >= 3);
    assert.ok(modules.some((row) => row.key === "mel_test_survey"));
    assert.ok(modules.some((row) => row.key === "store_call_training"));
  });

  it("builds welcome email preview without sending", () => {
    const training = buildTrainingAssignmentPreview({
      candidateId: "c-welcome",
      candidateName: "Alex Rivera",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
    });
    const email = buildWelcomeEmailPreview({
      candidateId: "c-welcome",
      candidateName: "Alex Rivera",
      email: "alex@example.com",
      assignedRecruiter: "Jordan Lee",
      training,
      replyTo: "recruiting@example.com",
      contactPhone: "555-0100",
    });
    assert.ok(email);
    assert.equal(email?.previewOnly, true);
    assert.match(email?.subject ?? "", /welcome/i);
    assert.match(email?.bodyText ?? "", /Training resources/);
  });

  it("calculates ready for work readiness with missing requirements", () => {
    const training = buildTrainingAssignmentPreview({
      candidateId: "c-ready",
      candidateName: "Alex Rivera",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
    });
    const readiness = buildReadyForWorkReadiness({
      candidateId: "c-ready",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
      training,
    });
    assert.equal(readiness.status, "missing_requirements");
    assert.ok(readiness.missingRequirementLabels.length > 0);
  });

  it("builds workspace snapshot with timeline and hooks", () => {
    const snapshot = buildOnboardingWorkspaceCandidateSnapshot({
      row: sampleRow("c-snap", {
        workflowStatus: "Signed",
        paperworkStatus: "signed",
        paperworkSignedAt: "2026-06-12T12:00:00.000Z",
      }),
      onboarding: null,
      referenceAt: "2026-06-20T12:00:00.000Z",
    });
    assert.equal(snapshot.previewMode, true);
    assert.equal(snapshot.currentState, "welcome_prepared");
    assert.ok(snapshot.completedSteps.length > 0);
    assert.ok(snapshot.training.modules.length >= 3);
    assert.ok(hooksForState(snapshot.currentState).length > 0);
    assert.equal(stateLabel(snapshot.currentState), "Welcome Prepared");
    assert.ok(snapshot.progress.totalSteps >= 10);
    assert.ok(snapshot.progress.progressPercent > 0);
    assert.ok(snapshot.activityTimeline.length > 0);
    assert.ok(snapshot.lastActivity);
    assert.equal(snapshot.stall.level, "high_risk");
  });

  it("calculates progress from lifecycle and training steps automatically", () => {
    const steps = listOnboardingProgressStepDefinitions();
    assert.ok(steps.length >= 10);
    const training = buildTrainingAssignmentPreview({
      candidateId: "c-progress",
      candidateName: "Alex Rivera",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
    });
    const progress = buildOnboardingProgressSummary({
      currentState: "welcome_prepared",
      training,
    });
    assert.equal(progress.totalSteps, steps.length);
    assert.ok(progress.progressPercent > 0);
    assert.match(progress.progressBar, /[█░]/);
  });

  it("formats elapsed time since last activity", () => {
    const label = formatElapsedSince("2026-06-26T08:00:00.000Z", Date.parse("2026-06-26T09:18:00.000Z"));
    assert.match(label ?? "", /hour|minute/);
  });

  it("detects blocked stall when paperwork error exists", () => {
    const training = buildTrainingAssignmentPreview({
      candidateId: "c-blocked",
      candidateName: "Alex Rivera",
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "sent",
    });
    const readiness = buildReadyForWorkReadiness({
      candidateId: "c-blocked",
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "failed",
      paperworkError: "Dropbox rate limit",
      training,
    });
    const stall = buildOnboardingStallAssessment({
      currentState: "paperwork_sent",
      readiness,
      lastActivity: null,
      paperworkError: "Dropbox rate limit",
      referenceMs: Date.parse("2026-06-26T12:00:00.000Z"),
    });
    assert.equal(stall.level, "blocked");
  });

  it("builds executive progress metrics from preview snapshots", () => {
    const result = runAutonomousOnboardingPreview({
      candidates: [
        scoredRowFromPreview(sampleRow("c-a")),
        scoredRowFromPreview(
          sampleRow("c-b", {
            workflowStatus: "Signed",
            paperworkStatus: "signed",
            paperworkSignedAt: "2026-06-10T12:00:00.000Z",
          }),
        ),
      ],
      onboardingRecords: [],
      fetchedAt: "2026-06-20T12:00:00.000Z",
    });
    const metrics = buildOnboardingExecutiveProgressMetrics({
      candidates: result.dashboard.candidates,
      referenceMs: Date.parse("2026-06-20T12:00:00.000Z"),
    });
    assert.equal(metrics.totalOnboarding, 2);
    assert.ok(metrics.averageProgressPct > 0);
    assert.ok(result.dashboard.progressMetrics.totalOnboarding === 2);
    assert.ok(Array.isArray(result.dashboard.stalledCandidates));
  });

  it("runs preview dashboard without writes", () => {
    const result = runAutonomousOnboardingPreview({
      candidates: [
        scoredRowFromPreview(sampleRow("c-a")),
        scoredRowFromPreview(sampleRow("c-b", { workflowStatus: "Signed", paperworkStatus: "signed" })),
      ],
      onboardingRecords: [],
      fetchedAt: "2026-06-20T12:00:00.000Z",
    });
    assert.equal(result.previewMode, true);
    assert.equal(result.ok, true);
    assert.equal(result.dashboard.previewMode, true);
    assert.equal(result.dashboard.candidates.length, 2);
    assert.ok(result.warnings.some((row) => row.includes("Preview mode")));
    assert.equal(listAutomationHookDefinitions().length, 8);
  });
});
