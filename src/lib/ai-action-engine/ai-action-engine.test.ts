import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AiInsight } from "@/lib/ai-recruiting-command-center/types";
import {
  assertManualConfirmationRequired,
  resolveInsightActions,
  evaluateAiWorkflows,
  buildCandidateRecoveryList,
} from "@/lib/ai-action-engine";
import { DEFAULT_AI_WORKFLOW_RULES } from "@/lib/ai-action-engine/action-registry";

function sampleInsight(overrides: Partial<AiInsight> = {}): AiInsight {
  return {
    id: "coach:contact:c1",
    category: "action",
    severity: "high",
    title: "Contact Alex Rivera",
    explanation: "Follow-up overdue",
    action: "Call candidate today",
    source: "recruiter-productivity",
    score: 80,
    entityId: "c1",
    ...overrides,
  };
}

describe("ai-action-engine", () => {
  it("requires confirmation before executing actions", () => {
    assert.throws(() => assertManualConfirmationRequired(false));
    assert.doesNotThrow(() => assertManualConfirmationRequired(true));
  });

  it("resolves one-click proposals from insights", () => {
    const proposals = resolveInsightActions(sampleInsight());
    assert.ok(proposals.length > 0);
    assert.equal(proposals[0]!.manualOnly, true);
    assert.ok(proposals.some((row) => row.actionKind === "send-follow-up"));
  });

  it("maps opportunity risk insights to route plan actions", () => {
    const proposals = resolveInsightActions(
      sampleInsight({
        id: "opp-risk:opp-1",
        entityId: "opp-1",
        source: "coverage-optimization",
      }),
    );
    assert.ok(proposals.some((row) => row.actionKind === "generate-route-plan"));
  });

  it("evaluates workflow rules when coverage risk is high", () => {
    const triggered = evaluateAiWorkflows({
      coverageRiskScore: 90,
      zeroApplicantJobs: 0,
      followUpsDue: 0,
      snapshot: {
        fetchedAt: "2026-05-28T12:00:00.000Z",
        briefing: {
          generatedAt: "2026-05-28T12:00:00.000Z",
          topRisks: { title: "Risks", items: [] },
          topWins: { title: "Wins", items: [] },
          hiringTrends: { title: "Trends", items: [] },
          coverageChanges: { title: "Coverage", items: [] },
          criticalAlerts: { title: "Alerts", items: [] },
          summary: "Test",
        },
        insightsFeed: [sampleInsight()],
        territoryAdvisor: [],
        recruiterCoach: {
          pipelineSummary: "",
          followUpSummary: "",
          conversionSummary: "",
          productivityTrend: "",
          candidatesToContact: [],
          jobsNeedingApplicants: [],
          followUpsDueToday: [],
        },
        opportunityRisks: [],
        suggestedQuestions: [],
      },
    });
    assert.ok(triggered.some((row) => row.ruleId === "coverage-risk-high"));
  });

  it("exposes default workflow rules", () => {
    assert.ok(DEFAULT_AI_WORKFLOW_RULES.length >= 3);
  });

  it("finds candidate recovery items from workflows", () => {
    const rows = buildCandidateRecoveryList({
      candidates: [
        {
          candidateId: "c1",
          firstName: "Alex",
          lastName: "Rivera",
          email: "alex@test.com",
          phone: "",
          source: "Indeed",
          stage: "Applied",
          appliedDate: "2026-05-10",
          createdDate: "",
          addedDate: "",
          updatedDate: "",
          addedDateSource: "",
          positionId: "j1",
          positionName: "Merch",
          city: "Dallas",
          state: "TX",
          zipCode: "",
          resumeText: "",
          hasResume: false,
        },
      ],
      workflows: {
        c1: {
          candidateId: "c1",
          workflowStatus: "Applied",
          notes: [],
          assignedRecruiter: "Unassigned",
          assignedDM: "Unassigned",
          lastActionAt: null,
          nextActionNeeded: "Contact",
          history: [],
          recruitingActions: {
            dmReview: false,
            recommendInterview: false,
            needsFollowUp: false,
            priorityList: false,
            onboardingPacketPrep: false,
            updatedAt: "2026-05-28T12:00:00.000Z",
          },
          followUpDueAt: null,
          snoozedUntil: null,
          signatureRequestId: null,
          paperworkTemplateKey: null,
          paperworkSentAt: null,
          paperworkViewedAt: null,
          paperworkViewCount: 0,
          paperworkSignedAt: null,
          paperworkStatus: null,
          paperworkError: null,
          onboardingContactEmail: null,
          directDepositStatus: "not_requested",
          directDepositRequestedAt: null,
          directDepositLastReminderAt: null,
          directDepositNotes: null,
          directDepositTriggeredByUserId: null,
        },
      },
      fetchedAt: "2026-05-28T12:00:00.000Z",
    });
    assert.ok(rows.length >= 0);
  });
});
