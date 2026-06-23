import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildAutopilotSnapshot } from "@/lib/autonomous-recruiting-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  buildHiringReadinessRows,
  buildPlacementCommandCenterSnapshot,
  buildPlacementFunnel,
  buildPlacementRecommendations,
  P60_SOURCE_MODULE,
  resolveHiringReadinessStatus,
} from "@/lib/placement-command-center";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";

function candidate(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-01",
    createdDate: "2026-06-01",
    addedDate: "2026-06-01",
    updatedDate: "2026-06-01",
    addedDateSource: "creation_date",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "Walmart reset merchandiser retail experience willing to travel 50 miles.",
    hasResume: true,
    questionnaireAnswers: [
      { question: "Smartphone access", answer: "Yes" },
      { question: "Internet access", answer: "Yes" },
      { question: "Comfort with apps", answer: "Yes" },
      { question: "Merchandising experience", answer: "5 years" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: "Taylor",
    assignedDM: "Taylor",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: patch.paperworkStatus ?? "not_sent",
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: patch.paperworkSentAt ?? null,
    paperworkSignedAt: patch.paperworkSignedAt ?? null,
    paperworkError: patch.paperworkError ?? null,
    directDepositStatus: patch.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
  };
}

function opportunity(patch: Partial<MelOpportunity> = {}): MelOpportunity {
  return {
    opportunityId: "opp-1",
    projectName: "Walmart Reset Dallas",
    client: "Walmart",
    storeAddress: "123 Main St",
    storeName: "Walmart #1234",
    city: "Dallas",
    state: "TX",
    projectType: "Walmart Reset",
    priority: "high",
    openStatus: true,
    territoryOwner: "Taylor",
    storeCall: "Open",
    projectNo: "P-100",
    isStaffed: false,
    ...patch,
  };
}

describe("placement-command-center", () => {
  it("resolves hiring readiness states from workflow overlay", () => {
    const readyRow = buildScoredWorkflowRow(
      candidate("c-ready"),
      workflow("c-ready", { workflowStatus: "Ready for MEL", paperworkStatus: "signed" }),
    );
    const blockedRow = buildScoredWorkflowRow(
      candidate("c-blocked", { stage: "Disqualified" }),
      workflow("c-blocked", { workflowStatus: "Not Qualified" }),
    );

    assert.equal(resolveHiringReadinessStatus(readyRow), "ready-to-place");
    assert.equal(resolveHiringReadinessStatus(blockedRow), "blocked");
  });

  it("builds placement recommendations with score, confidence, and territory", () => {
    const scoredRow = buildScoredWorkflowRow(
      candidate("c-1"),
      workflow("c-1", { workflowStatus: "Ready for MEL", paperworkStatus: "signed" }),
    );
    const readiness = buildHiringReadinessRows([scoredRow]);

    const recommendations = buildPlacementRecommendations({
      scoredRows: [scoredRow],
      readiness,
      opportunities: [opportunity()],
      coverageNeeds: [
        {
          territoryKey: "dm-tx:TX",
          territoryLabel: "Texas DM",
          dmName: "Taylor",
          states: ["TX"],
          openCalls: 4,
          activeReps: 1,
          pipelineCandidates: 2,
          applicantCount: 3,
          coverageStatus: "Critical",
          coverageNeedScore: 90,
          drivers: ["open calls"],
          recommendedAction: "Place ready candidate",
        },
      ],
      hiringRecommendations: [
        {
          candidateId: "c-1",
          candidateName: "Sam Rivera",
          positionName: "Merchandiser",
          city: "Dallas",
          state: "TX",
          territory: "Taylor",
          recommendedAction: "Hire Now",
          grade: "A",
          confidence: "high",
          coverageContext: "Critical",
          reasons: ["Strong fit"],
        },
      ],
    });

    assert.equal(recommendations.length, 1);
    assert.ok(recommendations[0]!.placementScore >= 70);
    assert.equal(recommendations[0]!.recommendedProject, "Walmart Reset Dallas");
    assert.ok(["high", "medium", "low"].includes(recommendations[0]!.confidence));
  });

  it("builds placement funnel across hiring workflow stages", () => {
    const scoredRow = buildScoredWorkflowRow(
      candidate("c-1"),
      workflow("c-1", { workflowStatus: "Ready for MEL", paperworkStatus: "signed" }),
    );
    const autopilotSnapshot = buildAutopilotSnapshot({
      jobs: [],
      candidates: [candidate("c-1")],
      workflows: { "c-1": workflow("c-1", { workflowStatus: "Ready for MEL", paperworkStatus: "signed" }) },
      opportunities: [opportunity()],
      scoredRows: [scoredRow],
      fetchedAt: "2026-06-23T12:00:00.000Z",
      approvalRules: [],
      automationRuns: {
        pending: 0,
        approved: 0,
        executed: 0,
        failed: 0,
        rejected: 0,
        generatedAt: "2026-06-23T12:00:00.000Z",
      },
    });

    const correlations: ExecutionCorrelation[] = [
      {
        id: "corr-hire",
        recommendationId: "hire-c-1",
        territory: "Taylor",
        type: "hiring",
        priority: "high",
        status: "completed",
        createdAt: "2026-06-23T12:00:00.000Z",
        candidateId: "c-1",
        accountabilityActionId: "ea-1",
      },
    ];

    const funnel = buildPlacementFunnel({
      autopilotSnapshot,
      scoredRows: [scoredRow],
      correlations,
      placementRecommendations: [],
    });

    assert.equal(funnel.find((row) => row.id === "ready-for-mel")?.count, 1);
    assert.equal(funnel.find((row) => row.id === "outcome-verified")?.count, 1);
  });

  it("builds executive placement dashboard without duplicate stores", () => {
    const scoredRow = buildScoredWorkflowRow(
      candidate("c-1"),
      workflow("c-1", { workflowStatus: "Paperwork Sent", paperworkStatus: "sent", paperworkSentAt: "2026-06-20T12:00:00.000Z" }),
    );
    const autopilotSnapshot = buildAutopilotSnapshot({
      jobs: [],
      candidates: [candidate("c-1")],
      workflows: {
        "c-1": workflow("c-1", {
          workflowStatus: "Paperwork Sent",
          paperworkStatus: "sent",
          paperworkSentAt: "2026-06-20T12:00:00.000Z",
        }),
      },
      opportunities: [opportunity()],
      scoredRows: [scoredRow],
      fetchedAt: "2026-06-23T12:00:00.000Z",
      approvalRules: [],
      automationRuns: {
        pending: 0,
        approved: 0,
        executed: 0,
        failed: 0,
        rejected: 0,
        generatedAt: "2026-06-23T12:00:00.000Z",
      },
    });

    const snapshot = buildPlacementCommandCenterSnapshot({
      autopilotSnapshot,
      scoredRows: [scoredRow],
      correlations: [],
      applicantPerformance: [
        {
          territoryKey: "dm-tx:TX",
          territoryLabel: "Texas DM",
          applicants: 4,
          qualified: 2,
          interview: 1,
          readyForMel: 0,
          targetApplicants: 6,
          timeToFillDays: 14,
          alerts: [],
        },
      ],
      opportunities: [opportunity()],
      fetchedAt: "2026-06-23T12:00:00.000Z",
    });

    assert.ok(snapshot.kpis.needsAction >= 1);
    assert.ok(snapshot.paperworkBottlenecks.length >= 1);
    assert.ok(snapshot.funnel.length === 10);
    assert.equal("correlations" in snapshot, false);
    assert.equal("actions" in snapshot, false);
    assert.equal(P60_SOURCE_MODULE, "placement-command-center");
  });
});
