import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import { buildControlledPaperworkAutomationSnapshot } from "@/lib/p145-controlled-paperwork-automation/build-controlled-paperwork-automation-snapshot";
import {
  P145_COMMUNICATION_COOLDOWN_HOURS,
  buildPaperworkQueue,
  evaluatePaperworkCandidate,
} from "@/lib/recruiting/paperwork-automation-engine";

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
};

describe("recruiting/paperwork-automation-engine", () => {
  it("documents communication cooldown constant", () => {
    assert.equal(P145_COMMUNICATION_COOLDOWN_HOURS, 24);
  });

  it("includes ready-to-send candidates in the queue", () => {
    const jobsByPositionId = new Map([[publishedJob.jobId, publishedJob]]);
    const item = evaluatePaperworkCandidate({
      row: mockRow(),
      jobsByPositionId,
      onboarding: null,
    });

    assert.ok(item);
    assert.equal(item.recommendedAction, "Send Initial Paperwork");
    assert.equal(item.approvalRequired, true);
    assert.ok(item.confidence > 0);
    assert.ok(item.reason.includes("Approval required"));
  });

  it("excludes completed paperwork and archived candidates", () => {
    const jobsByPositionId = new Map([[publishedJob.jobId, publishedJob]]);
    assert.equal(
      evaluatePaperworkCandidate({
        row: mockRow({ paperworkStatus: "signed", workflowStatus: "Signed" }),
        jobsByPositionId,
        onboarding: null,
      }),
      null,
    );
    assert.equal(
      evaluatePaperworkCandidate({
        row: mockRow({ workflowStatus: "Not Qualified" }),
        jobsByPositionId,
        onboarding: null,
      }),
      null,
    );
  });

  it("recommends reminder when paperwork is outstanding and aged", () => {
    const jobsByPositionId = new Map([[publishedJob.jobId, publishedJob]]);
    const sentAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const item = evaluatePaperworkCandidate({
      row: mockRow({
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig-1",
        paperworkSentAt: sentAt,
        actionType: "await-signature",
      }),
      jobsByPositionId,
      onboarding: null,
    });

    assert.ok(item);
    assert.equal(item?.recommendedAction, "Send Reminder #1");
  });

  it("blocks duplicate communication within cooldown", () => {
    const jobsByPositionId = new Map([[publishedJob.jobId, publishedJob]]);
    const item = evaluatePaperworkCandidate({
      row: mockRow({
        lastActionAt: new Date().toISOString(),
      }),
      jobsByPositionId,
      onboarding: null,
    });

    assert.ok(item);
    assert.ok(item?.blockers.includes("Recent Contact Cooldown"));
    assert.equal(item?.recommendedAction, "Wait");
  });
});

describe("p145-controlled-paperwork-automation snapshot", () => {
  it("builds executive metrics and approval queue", () => {
    const jobsByPositionId = new Map([[publishedJob.jobId, publishedJob]]);
    const queue = buildPaperworkQueue([
      {
        row: mockRow({ candidateId: "c-1" }),
        jobsByPositionId,
        onboarding: null,
      },
      {
        row: mockRow({
          candidateId: "c-2",
          assignedRecruiter: "Sam",
          workflowStatus: "Paperwork Sent",
          paperworkStatus: "viewed",
          signatureRequestId: "sig-2",
          paperworkSentAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
          actionType: "await-signature",
        }),
        jobsByPositionId,
        onboarding: null,
      },
    ]);

    const snapshot = buildControlledPaperworkAutomationSnapshot({
      queue,
      generatedAt: new Date().toISOString(),
      partialSync: false,
      candidatesEvaluated: 2,
      recentAuditEvents: [],
      executionMode: "approval",
      contexts: [
        { row: mockRow({ candidateId: "c-1" }), jobsByPositionId, onboarding: null },
        {
          row: mockRow({
            candidateId: "c-2",
            assignedRecruiter: "Sam",
            workflowStatus: "Paperwork Sent",
            paperworkStatus: "viewed",
            signatureRequestId: "sig-2",
            paperworkSentAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
            actionType: "await-signature",
          }),
          jobsByPositionId,
          onboarding: null,
        },
      ],
    });

    assert.equal(snapshot.sourcePhase, "P145");
    assert.equal(snapshot.mode, "approvalRequired");
    assert.equal(snapshot.executeBatchCalled, false);
    assert.equal(snapshot.breezyWrites, false);
    assert.equal(snapshot.paperworkSent, false);
    assert.ok(snapshot.autoSend);
    assert.equal(snapshot.autoSend.autoSendEnabled, false);
    assert.equal(snapshot.lastAutoSendSummary, null);
    assert.ok(snapshot.executive.outstandingPaperwork >= 1);
    assert.ok(snapshot.validation.initialPaperworkCount >= 0);
    for (const row of snapshot.approvalQueue) {
      assert.equal(row.approvalRequired, true);
    }
  });
});
