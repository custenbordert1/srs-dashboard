import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  P80_ONBOARDING_PIPELINE_STAGES,
  buildOnboardingPipelineExecutiveSummary,
  buildOnboardingPipelineRecord,
  buildPipelineProgressPercent,
  isOnboardingPipelineEligible,
  pipelineStageLabel,
  resolveOnboardingPipelineStage,
  runOnboardingPipelinePreview,
} from "@/lib/onboarding-pipeline-engine";
import { buildOnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";

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
    workflowStatus: "Signed",
    paperworkStatus: "signed",
    paperworkError: null,
    paperworkSentAt: "2026-06-10T12:00:00.000Z",
    paperworkSignedAt: "2026-06-12T12:00:00.000Z",
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

describe("onboarding-pipeline-engine", () => {
  it("defines six P80 pipeline stages with labels", () => {
    assert.equal(P80_ONBOARDING_PIPELINE_STAGES.length, 6);
    assert.equal(pipelineStageLabel("paperwork_complete"), "Paperwork Complete");
    assert.equal(pipelineStageLabel("ready_for_work"), "Ready for Work");
  });

  it("only includes candidates with completed paperwork", () => {
    assert.equal(isOnboardingPipelineEligible(sampleRow("eligible")), true);
    assert.equal(
      isOnboardingPipelineEligible(
        sampleRow("not-eligible", {
          workflowStatus: "Paperwork Sent",
          paperworkStatus: "sent",
          paperworkSignedAt: null,
        }),
      ),
      false,
    );
    assert.equal(
      isOnboardingPipelineEligible(
        sampleRow("withdrawn", {
          workflowStatus: "Withdrawn",
          paperworkStatus: "signed",
        }),
      ),
      false,
    );
  });

  it("maps P67 snapshot to P80 stages and progress", () => {
    const snapshot = buildOnboardingWorkspaceCandidateSnapshot({
      row: sampleRow("c-stage"),
      onboarding: null,
      referenceAt: "2026-06-20T12:00:00.000Z",
    });
    const stage = resolveOnboardingPipelineStage(snapshot);
    assert.equal(stage, "welcome_email_ready");
    assert.equal(buildPipelineProgressPercent(stage), 17);
  });

  it("builds pipeline record with timeline and preview actions", () => {
    const record = buildOnboardingPipelineRecord({
      row: sampleRow("c-record"),
      onboarding: null,
      referenceAt: "2026-06-20T12:00:00.000Z",
    });
    assert.equal(record.previewMode, true);
    assert.equal(record.stage, "welcome_email_ready");
    assert.equal(record.timeline.length, 6);
    assert.ok(record.previewActions.some((action) => action.kind === "welcome_email"));
    assert.ok(record.previewActions.every((action) => action.previewOnly));
    assert.ok(record.recruiterActions.length > 0);
    assert.equal(record.stalled, true);
  });

  it("builds executive summary from pipeline records", () => {
    const records = [
      buildOnboardingPipelineRecord({ row: sampleRow("a"), onboarding: null }),
      buildOnboardingPipelineRecord({
        row: sampleRow("b", { workflowStatus: "Active Rep" }),
        onboarding: null,
      }),
    ];
    const summary = buildOnboardingPipelineExecutiveSummary(records);
    assert.equal(summary.totalRecords, 2);
    assert.ok(summary.averageProgressPercent >= 0);
    assert.ok(summary.stalledCount >= 1);
  });

  it("runs preview dashboard without production writes", () => {
    const result = runOnboardingPipelinePreview({
      candidates: [
        scoredRowFromPreview(sampleRow("mtd-1")),
        scoredRowFromPreview(
          sampleRow("mtd-2", {
            workflowStatus: "Paperwork Sent",
            paperworkStatus: "sent",
            paperworkSignedAt: null,
          }),
        ),
      ],
      onboardingRecords: [],
      fetchedAt: "2026-06-20T12:00:00.000Z",
    });
    assert.equal(result.ok, true);
    assert.equal(result.previewMode, true);
    assert.equal(result.dashboard.records.length, 1);
    assert.equal(result.dashboard.summary.totalRecords, 1);
    assert.ok(result.warnings.some((warning) => /preview mode/i.test(warning)));
  });

  it("generates P81 welcome workflow tasks with due dates", () => {
    const record = buildOnboardingPipelineRecord({
      row: sampleRow("c-p81"),
      onboarding: null,
      referenceAt: "2026-06-20T12:00:00.000Z",
      context: { assignedDM: "Taylor DM", positionName: "Merchandiser" },
    });
    assert.equal(record.workflowTasks.length, 5);
    assert.ok(record.workflowTasks.every((task) => task.previewOnly));
    assert.ok(record.welcomeEmail);
    assert.equal(record.welcomeEmail?.districtManager, "Taylor DM");
    assert.ok(record.trainingAssignments.length >= 3);
    assert.ok(record.readiness.score >= 20);
    assert.ok(record.estimatedCompletionAt);
    assert.ok(record.dueDates.currentStageDueAt);
  });

  it("calculates due dates from paperwork signed anchor", () => {
    const record = buildOnboardingPipelineRecord({
      row: sampleRow("c-due", { paperworkSignedAt: "2026-06-12T12:00:00.000Z" }),
      onboarding: null,
      referenceAt: "2026-06-20T12:00:00.000Z",
    });
    const readyAt = Date.parse(record.estimatedCompletionAt);
    const anchor = Date.parse("2026-06-12T12:00:00.000Z");
    const fourDays = 4 * 24 * 60 * 60 * 1000;
    assert.equal(readyAt - anchor, fourDays);
    assert.equal(record.stage === "ready_for_work" ? record.progressPercent : record.progressPercent < 100, true);
  });

  it("builds executive summary with P81 workflow insights", () => {
    const records = [
      buildOnboardingPipelineRecord({
        row: sampleRow("exec-a"),
        onboarding: null,
        referenceAt: "2026-06-20T12:00:00.000Z",
      }),
      buildOnboardingPipelineRecord({
        row: sampleRow("exec-b", { workflowStatus: "Active Rep" }),
        onboarding: null,
        referenceAt: "2026-06-20T12:00:00.000Z",
      }),
    ];
    const summary = buildOnboardingPipelineExecutiveSummary(records, "2026-06-20T12:00:00.000Z");
    assert.equal(summary.totalRecords, 2);
    assert.ok(summary.averageOnboardingDays != null);
    assert.ok(summary.bottleneckStageLabel);
    assert.ok(summary.longestWaiting);
  });
});
