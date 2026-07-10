import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import {
  buildPaperworkReminderEmail,
  P146_REMINDER_1_TEMPLATE_ID,
  P146_REMINDER_2_TEMPLATE_ID,
} from "@/lib/recruiting/paperwork-reminder-templates";
import {
  evaluateAutoSendEligibility,
  executeAutoSendPaperworkReminders,
  isP146AutoSendEnabled,
  P146_AUTO_SEND_CONFIDENCE_MIN,
} from "@/lib/recruiting/paperwork-execution-engine";
import type { PaperworkAutomationContext } from "@/lib/recruiting/paperwork-automation-engine";
import { evaluatePaperworkCandidate } from "@/lib/recruiting/paperwork-automation-engine";

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
    workflowStatus: "Paperwork Sent",
    assignedRecruiter: "Taylor",
    assignedDM: "DM-1",
    hasResume: true,
    matchPercent: 82,
    isTopMatch: true,
    distanceMiles: 12,
    aiGrade: "B",
    nextActionNeeded: "Send reminder",
    paperworkStatus: "sent",
    signatureRequestId: "sig-1",
    paperworkSentAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    actionType: "await-signature",
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
      recommendedNextAction: "Send reminder",
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
};

function reminderContext(overrides: Partial<ScoredCandidateWorkflowRow> = {}): PaperworkAutomationContext {
  const jobsByPositionId = new Map([[publishedJob.jobId, publishedJob]]);
  return {
    row: mockRow(overrides),
    jobsByPositionId,
    onboarding: null,
    advancement: {
      candidateId: overrides.candidateId ?? "c-1",
      candidateName: "Alex Rivera",
      confidence: 90,
    } as PaperworkAutomationContext["advancement"],
  };
}

describe("recruiting/paperwork-reminder-templates", () => {
  it("builds safe reminder templates without pay-delay language", () => {
    const row = mockRow();
    const reminder1 = buildPaperworkReminderEmail({ row, action: "Send Reminder #1" });
    const reminder2 = buildPaperworkReminderEmail({ row, action: "Send Reminder #2" });

    assert.equal(reminder1.templateId, P146_REMINDER_1_TEMPLATE_ID);
    assert.equal(reminder2.templateId, P146_REMINDER_2_TEMPLATE_ID);
    assert.ok(reminder1.text.toLowerCase().includes("friendly reminder"));
    assert.ok(reminder2.text.toLowerCase().includes("next step"));
    assert.equal(reminder1.text.toLowerCase().includes("pay delay"), false);
  });
});

describe("recruiting/paperwork-execution-engine", () => {
  it("defaults auto-send to disabled", () => {
    assert.equal(isP146AutoSendEnabled({ P146_AUTO_SEND_PAPERWORK_REMINDERS_ENABLED: "false" }), false);
    assert.equal(isP146AutoSendEnabled({}), false);
  });

  it("rejects initial paperwork for auto-send", () => {
    const context = reminderContext({
      workflowStatus: "Paperwork Needed",
      paperworkStatus: "not_sent",
      signatureRequestId: null,
      paperworkSentAt: null,
      actionType: "send-paperwork",
    });
    const item = evaluatePaperworkCandidate(context);
    assert.ok(item);
    const eligibility = evaluateAutoSendEligibility({
      item: { ...item, confidence: 95, blockers: [] },
      context,
      auditEvents: [],
    });
    assert.equal(eligibility.autoSendEligible, false);
  });

  it("allows reminder #1 when confidence is high and no blockers", () => {
    const context = reminderContext();
    const item = evaluatePaperworkCandidate(context);
    assert.ok(item);
    assert.equal(item.recommendedAction, "Send Reminder #1");
    assert.ok(item.confidence >= P146_AUTO_SEND_CONFIDENCE_MIN);
    const eligibility = evaluateAutoSendEligibility({
      item,
      context,
      auditEvents: [],
    });
    assert.equal(eligibility.autoSendEligible, true);
  });

  it("dry run never marks paperworkSent when auto-send disabled", async () => {
    const context = reminderContext();
    const summary = await executeAutoSendPaperworkReminders({
      contexts: [context],
      auditEvents: [],
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
  });
});
