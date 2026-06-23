import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildAutopilotSnapshot } from "@/lib/autonomous-recruiting-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  buildHiringReadinessRows,
  buildPlacementCommandCenterSnapshot,
  buildPlacementExecutionRecommendations,
  buildPlacementFunnel,
  buildPlacementOutcomeMetrics,
  buildPlacementRecommendations,
  P60_SOURCE_MODULE,
  P61_SOURCE_PHASE,
  planPlacementCorrelations,
  resolveHiringReadinessStatus,
} from "@/lib/placement-command-center";
import { approvePlacementWithAccountability } from "@/lib/placement-command-center/bridge-p61-accountability";
import { validatePlacementCorrelationAccess } from "@/lib/placement-command-center/guard-placement-correlation";
import { approveCorrelationWithAccountability } from "@/lib/autonomous-recruiting-execution/bridge-accountability";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import { listCorrelations, upsertCorrelations } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { AuthSession } from "@/lib/auth/types";
import { loadExecutiveAccountabilityStore } from "@/lib/executive-accountability/recommendation-store";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

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

  it("builds P61 placement execution recommendations with match labels and fit scores", () => {
    const scoredRow = buildScoredWorkflowRow(
      candidate("c-1"),
      workflow("c-1", { workflowStatus: "Ready for MEL", paperworkStatus: "signed" }),
    );
    const readiness = buildHiringReadinessRows([scoredRow]);
    const base = buildPlacementRecommendations({
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

    const executionRecs = buildPlacementExecutionRecommendations(base);
    assert.equal(executionRecs.length, 1);
    assert.ok(
      ["Strong Match", "Good Match", "Review Needed", "Do Not Recommend"].includes(
        executionRecs[0]!.matchLabel,
      ),
    );
    assert.ok(executionRecs[0]!.fitScores.placementConfidence > 0);
    assert.equal(executionRecs[0]!.recommendationId, "placement-c-1-opp-1");
  });
});

describe("placement-command-center P61 bridge", () => {
  let isolation: IsolatedRecruitingDataHandle;

  before(async () => {
    isolation = await installIsolatedRecruitingDataDir("p61-placement-");
  });

  after(async () => {
    await isolation.restore();
  });

  it("plans placement correlations in P58 store without new stores", async () => {
    const executionRecs = [
      {
        candidateId: "c-1",
        candidateName: "Sam Rivera",
        placementScore: 82,
        confidence: "high" as const,
        recommendedTerritory: "Taylor",
        recommendedProject: "Walmart Reset Dallas",
        recommendedProjectId: "opp-1",
        distanceMiles: 12,
        coverageUrgency: "Critical" as const,
        readinessStatus: "ready-to-place" as const,
        reasons: ["Strong territory fit"],
        recommendationId: "placement-c-1-opp-1",
        matchLabel: "Strong Match" as const,
        fitScores: {
          placementConfidence: 88,
          territoryFit: 90,
          projectFit: 82,
          distanceFit: 95,
          availabilityFit: 95,
          readinessFit: 92,
        },
      },
    ];

    const planned = await planPlacementCorrelations(executionRecs);
    assert.equal(planned.length, 1);
    assert.equal(planned[0]!.type, "placement");
    assert.equal(planned[0]!.status, "detected");

    const stored = await listCorrelations();
    assert.equal(stored.filter((row) => row.type === "placement").length, 1);
  });

  it("records placement approval in executive accountability via P60 source module", async () => {
    const executionRecs = [
      {
        candidateId: "c-2",
        candidateName: "Alex Kim",
        placementScore: 75,
        confidence: "medium" as const,
        recommendedTerritory: "Taylor",
        recommendedProject: "Walmart Reset Dallas",
        recommendedProjectId: "opp-1",
        distanceMiles: 30,
        coverageUrgency: "At Risk" as const,
        readinessStatus: "ready-to-place" as const,
        reasons: ["Good project fit"],
        recommendationId: "placement-c-2-opp-1",
        matchLabel: "Good Match" as const,
        fitScores: {
          placementConfidence: 72,
          territoryFit: 78,
          projectFit: 75,
          distanceFit: 80,
          availabilityFit: 95,
          readinessFit: 88,
        },
      },
    ];

    const [planned] = await planPlacementCorrelations(executionRecs);
    const approved = await approvePlacementWithAccountability(planned!.id, {
      displayName: "Executive Tester",
    });
    assert.equal(approved?.status, "approved");

    const store = await loadExecutiveAccountabilityStore();
    const action = store.actions.find(
      (row) =>
        row.sourceModule === P60_SOURCE_MODULE &&
        row.sourceForecastKey === planned!.recommendationId,
    );
    assert.ok(action);
    assert.equal(action!.sourcePhase, P61_SOURCE_PHASE);
    assert.equal(action!.recommendationKind, "placement");
  });

  it("builds placement outcome metrics from correlations and accountability history", () => {
    const correlations: ExecutionCorrelation[] = [
      {
        id: "corr-placement-1",
        recommendationId: "placement-c-1-opp-1",
        territory: "Taylor",
        type: "placement",
        priority: "high",
        status: "completed",
        createdAt: "2026-06-23T12:00:00.000Z",
        candidateId: "c-1",
        completedAt: "2026-06-23T13:00:00.000Z",
      },
      {
        id: "corr-placement-2",
        recommendationId: "placement-c-2-opp-1",
        territory: "Taylor",
        type: "placement",
        priority: "medium",
        status: "approved",
        createdAt: "2026-06-23T12:00:00.000Z",
        candidateId: "c-2",
      },
    ];

    const metrics = buildPlacementOutcomeMetrics({
      correlations,
      accountabilityActions: [],
      applicantPerformance: [
        {
          territoryKey: "dm-tx:TX",
          territoryLabel: "Texas DM",
          applicants: 4,
          qualified: 2,
          interview: 1,
          readyForMel: 1,
          targetApplicants: 6,
          timeToFillDays: 10,
          alerts: [],
        },
      ],
    });

    assert.equal(metrics.recommendedPlacements, 2);
    assert.equal(metrics.approvedPlacements, 2);
    assert.equal(metrics.coverageGapsFilled, 1);
    assert.equal(metrics.placementSuccessRate, 100);
  });

  it("rejects non-placement correlations for placement mutations", async () => {
    const [hiringCorrelation] = await upsertCorrelations([
      {
        id: "corr-hiring-only",
        recommendationId: "hire-guard-test",
        territory: "Taylor",
        type: "hiring",
        priority: "high",
        status: "detected",
        createdAt: "2026-06-23T12:00:00.000Z",
        candidateId: "c-guard",
        hiringAction: "Hire Now",
      },
    ]);

    const rejected = await approvePlacementWithAccountability(hiringCorrelation!.id, {
      displayName: "Executive Tester",
    });
    assert.equal(rejected, null);
  });

  it("enforces territory scope for placement correlations", () => {
    const placementCorrelation: ExecutionCorrelation = {
      id: "corr-placement-guard",
      recommendationId: "placement-c-tx-opp-1",
      territory: "Taylor",
      type: "placement",
      priority: "high",
      status: "detected",
      createdAt: "2026-06-23T12:00:00.000Z",
      candidateId: "c-1",
    };

    const dmSession: AuthSession = {
      userId: "dm-ca",
      email: "dm@example.com",
      name: "DM CA",
      role: "dm",
      territoryStates: ["CA"],
      expiresAt: "2099-01-01T00:00:00.000Z",
    };

    const blocked = validatePlacementCorrelationAccess(
      dmSession,
      placementCorrelation,
      [candidate("c-1", { state: "TX" })],
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.status, 403);
    }

    const recruiterSession: AuthSession = {
      userId: "recruiter-1",
      email: "recruiter@example.com",
      name: "Recruiter",
      role: "recruiter",
      territoryStates: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
    };

    const allowed = validatePlacementCorrelationAccess(
      recruiterSession,
      placementCorrelation,
      [candidate("c-1", { state: "TX" })],
    );
    assert.equal(allowed.ok, true);
  });

  it("uses one accountability path when placement is approved via P58 bridge", async () => {
    const executionRecs = [
      {
        candidateId: "c-3",
        candidateName: "Jordan Lee",
        placementScore: 80,
        confidence: "high" as const,
        recommendedTerritory: "Taylor",
        recommendedProject: "Walmart Reset Dallas",
        recommendedProjectId: "opp-1",
        distanceMiles: 18,
        coverageUrgency: "Critical" as const,
        readinessStatus: "ready-to-place" as const,
        reasons: ["Strong territory fit"],
        recommendationId: "placement-c-3-opp-1",
        matchLabel: "Strong Match" as const,
        fitScores: {
          placementConfidence: 85,
          territoryFit: 90,
          projectFit: 80,
          distanceFit: 85,
          availabilityFit: 95,
          readinessFit: 90,
        },
      },
    ];

    const [planned] = await planPlacementCorrelations(executionRecs);
    const approved = await approveCorrelationWithAccountability(planned!.id, {
      displayName: "Executive Tester",
    });
    assert.equal(approved?.status, "approved");

    const store = await loadExecutiveAccountabilityStore();
    const placementActions = store.actions.filter(
      (row) =>
        row.sourceForecastKey === planned!.recommendationId &&
        row.recommendationKind === "placement" &&
        row.status !== "archived",
    );
    assert.equal(placementActions.length, 1);
    assert.equal(placementActions[0]!.sourceModule, P60_SOURCE_MODULE);
    assert.equal(placementActions[0]!.sourcePhase, P61_SOURCE_PHASE);
  });
});
