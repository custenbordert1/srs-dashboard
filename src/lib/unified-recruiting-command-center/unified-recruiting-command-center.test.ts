import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type {
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { AutopilotRecommendation, RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import {
  buildAlertWorkQueueItem,
  buildCommandCenterExecutiveBriefing,
  buildCommandCenterKpis,
  buildCommandCenterProductivityMetrics,
  buildDrawerContextForQueueItem,
  buildUnifiedRecruitingCommandCenterSnapshot,
  buildUnifiedWorkQueue,
  compareWorkQueueItems,
} from "@/lib/unified-recruiting-command-center";
import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;

function sampleAlert(overrides: Partial<ExecutiveAlert> = {}): ExecutiveAlert {
  return {
    id: "alert-1",
    title: "Critical coverage gap",
    description: "Store has zero pipeline",
    severity: "critical",
    category: "coverage",
    impactScore: 92,
    recommendedAction: "notify-dm",
    destination: { tabId: "executive-alerts", label: "Alerts" },
    automationKind: "coverage-review",
    manualOnly: true,
    createdAt: "2026-06-15T08:00:00.000Z",
    reason: "Zero applicants in territory",
    context: {
      dmName: SAMPLE_DM,
      storeName: "Store 101",
      projectName: "Project Alpha",
      state: "TX",
      linkedCandidates: [],
      linkedReps: [],
      dataSources: ["breezy"],
    },
    ...overrides,
  };
}

function sampleRecommendation(
  overrides: Partial<AutopilotRecommendation> = {},
): AutopilotRecommendation {
  return {
    id: "autopilot:territory:dm-1",
    kind: "escalate-to-dm",
    title: "Escalate to DM",
    entityType: "dm",
    entityId: `dm:${SAMPLE_DM}`,
    entityLabel: SAMPLE_DM,
    dmName: SAMPLE_DM,
    impactScore: 70,
    confidenceScore: 65,
    estimatedOutcomeImprovement: 72,
    reasoning: "Territory risk elevated with shallow pipeline.",
    supportingMetrics: [{ label: "Pipeline depth", value: "2" }],
    opportunity: {
      currentRisk: 78,
      potentialImprovement: 20,
      estimatedCandidateGain: 10,
      estimatedCoverageGain: 8,
      estimatedCompletionGain: 5,
      expectedRoiScore: 68,
    },
    prioritizationScore: 75,
    horizon: "quick-win",
    navigation: {
      tabId: "predictive-territory-risk",
      elementId: "predictive-territory-risk-dashboard",
      label: "Open Territory Risk",
    },
    ...overrides,
  };
}

function sampleDailyAction(
  overrides: Partial<DailyActionPlanItem> = {},
): DailyActionPlanItem {
  return {
    id: "daily-1",
    alertId: "daily-action:autopilot:territory:dm-1",
    bucket: "must-do-today",
    title: "Escalate DM coverage",
    owner: SAMPLE_DM,
    ownerKind: "dm",
    dueDate: "2026-06-15T23:59:59.000Z",
    expectedImpact: 80,
    expectedCoverageGain: 6,
    expectedHireGain: 2,
    reasoning: "Must resolve before end of day",
    links: {
      recommendationId: "autopilot:territory:dm-1",
      recommendationKind: "escalate-to-dm",
      recommendationTitle: "Escalate to DM",
      riskScore: 78,
    },
    navigation: {
      tabId: "daily-action-plan",
      label: "Execute action",
    },
    status: "new",
    recommendation: sampleRecommendation(),
    ...overrides,
  };
}

function sampleFollowUp(
  overrides: Partial<ExecutiveAlertFollowUp> = {},
): ExecutiveAlertFollowUp {
  return {
    id: "follow-up-1",
    alertId: "alert-1",
    ownerKind: "dm",
    ownerName: SAMPLE_DM,
    dueDate: "2026-06-14T12:00:00.000Z",
    priority: "critical",
    createdAt: "2026-06-13T12:00:00.000Z",
    createdByUserId: "user-1",
    createdByName: "Executive",
    ...overrides,
  };
}

function sampleBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates: [],
    workflows: {},
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Alpha",
        client: "Client",
        storeAddress: "1 Main",
        storeName: "Store 101",
        city: "Houston",
        state: "TX",
        projectType: "Retail",
        priority: "High",
        openStatus: true,
        territoryOwner: SAMPLE_DM,
        storeCall: "Open",
        projectNo: "P-1",
        isStaffed: false,
      },
    ],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: null,
      opportunities: [
        {
          opportunityId: "opp-1",
          projectName: "Alpha",
          client: "Client",
          storeName: "Store 101",
          city: "Houston",
          state: "TX",
          territoryOwner: SAMPLE_DM,
          priority: "high",
          nearby: {
            within10: 0,
            within25: 1,
            within50: 2,
            activeWithin50: 1,
            inactiveWithin50: 1,
          },
          activeRepDensity: 1,
          skillMatchScore: 20,
          recentLoginScore: 10,
          territoryAlignmentScore: 15,
          pipelineScore: 18,
          coverageScore: 42,
          staffingRisk: "RED",
          recommendedAction: "Escalate",
          topRecommendedReps: [],
        },
      ],
      executiveSummary: {
        totalOpenOpportunities: 1,
        highRiskProjectCount: 1,
        yellowRiskProjectCount: 0,
        zeroNearbyRepProjects: 0,
        averageCoverageScore: 42,
        lowDensityStates: [],
        highOpportunityLowRepMarkets: [],
      },
      dmAlerts: {
        highRiskProjects: [],
        noNearbyReps: [],
        recruitingUrgency: [],
        bestAvailableReps: [],
      },
    },
    fetchedAt: "2026-06-15T12:00:00.000Z",
    candidatesResult: { ok: true, candidates: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    melOk: true,
    intelligenceCache: {
      cacheStatus: "hit",
      snapshotAgeMs: 1000,
      hitCount: 1,
      missCount: 0,
      lastRefreshAt: "2026-06-15T12:00:00.000Z",
    },
  };
}

function sampleRiskSnapshot(): PredictiveTerritoryRiskSnapshot {
  return {
    generatedAt: "2026-06-15T12:00:00.000Z",
    executiveSummary: {
      totalCriticalTerritories: 2,
      totalHighRiskTerritories: 3,
      projectsAtRisk: 4,
      predictedCoverageGap: 18,
    },
    highestRiskTerritories: [
      {
        entityId: `dm:${SAMPLE_DM}`,
        entityType: "dm",
        label: SAMPLE_DM,
        dmName: SAMPLE_DM,
        states: ["TX"],
        riskScore: 88,
        riskLevel: "critical",
        trend: "declining",
        factors: {
          openCallsPressure: 80,
          pipelineDepthRisk: 90,
          applicationVelocityRisk: 70,
          hiringVelocityRisk: 65,
          coverageGapRisk: 85,
          completionTrendRisk: 60,
          deadlinePressure: 55,
          alertVolumeRisk: 40,
          followUpBacklogRisk: 50,
        },
        openCalls: 12,
        coveragePercent: 42,
        pipelineDepth: 1,
        alertCount: 2,
        followUpCount: 1,
        recommendations: [
          {
            kind: "escalate-dm",
            label: "Escalate DM",
            reason: "Coverage gap widening",
            navigation: {
              tabId: "predictive-territory-risk",
              label: "Open risk",
            },
          },
        ],
        navigation: {
          tabId: "predictive-territory-risk",
          label: "Open risk",
        },
      },
    ],
    healthiestTerritories: [],
    forecasts: [
      {
        id: "forecast-1",
        kind: "zero-pipeline-store",
        label: "Zero pipeline store",
        dmName: SAMPLE_DM,
        confidence: 82,
        reason: "No applicants",
        navigation: { tabId: "predictive-territory-risk", label: "Open" },
      },
      {
        id: "forecast-2",
        kind: "territory-miss-completion",
        label: "Miss completion",
        dmName: SAMPLE_DM,
        confidence: 70,
        reason: "Velocity low",
        navigation: { tabId: "predictive-territory-risk", label: "Open" },
      },
    ],
    territories: [],
    projects: [],
    storeClusters: [],
  };
}

function sampleDailyPlan(): DailyActionPlanSnapshot {
  return {
    generatedAt: "2026-06-15T12:00:00.000Z",
    planDate: "2026-06-15",
    executiveSummary: {
      criticalActionsToday: 1,
      projectedCoverageGain: 6,
      projectedHireGain: 2,
      riskReduction: 12,
      mustDoCount: 1,
      shouldDoCount: 0,
      monitorCount: 0,
    },
    topActionsToday: [sampleDailyAction()],
    mustDoToday: [sampleDailyAction()],
    shouldDoThisWeek: [],
    monitorOnly: [],
    all: [sampleDailyAction()],
  };
}

function sampleAutopilot(): RecruitingAutopilotSnapshot {
  return {
    generatedAt: "2026-06-15T12:00:00.000Z",
    executiveSummary: {
      topActionsToday: [sampleRecommendation()],
      expectedAdditionalCandidates: 10,
      expectedAdditionalHires: 3,
      expectedAdditionalStoreCoverage: 8,
      expectedRiskReduction: 15,
    },
    highestImpact: [sampleRecommendation()],
    quickWins: [],
    longTerm: [],
    byTerritory: {},
    byProject: {},
    byDm: {},
    all: [sampleRecommendation()],
  };
}

describe("unified recruiting command center", () => {
  it("prioritizes work queue by impact, critical priority, and overdue", () => {
    const referenceMs = Date.parse("2026-06-15T12:00:00.000Z");
    const queue = buildUnifiedWorkQueue({
      alerts: [sampleAlert({ id: "alert-low", severity: "low", impactScore: 40 })],
      recommendations: [sampleRecommendation({ prioritizationScore: 95 })],
      followUps: [sampleFollowUp()],
      dailyActions: [sampleDailyAction({ expectedImpact: 70 })],
      statusOverlays: [],
      referenceMs,
    });

    assert.equal(queue[0]?.type, "recommendation");
    assert.equal(queue[0]?.impactScore, 95);
    assert.ok(queue.some((item) => item.isOverdue));
    assert.ok(compareWorkQueueItems(queue[0]!, queue[1]!) < 0);
  });

  it("calculates executive KPIs from bundle and snapshots", () => {
    const kpis = buildCommandCenterKpis({
      bundle: sampleBundle(),
      riskSnapshot: sampleRiskSnapshot(),
      dailyActionPlan: sampleDailyPlan(),
    });

    assert.equal(kpis.openCalls, 1);
    assert.equal(kpis.criticalTerritories, 2);
    assert.equal(kpis.zeroPipelineStores, 1);
    assert.equal(kpis.coveragePercent, 42);
    assert.equal(kpis.predictedCoverageGap, 18);
    assert.equal(kpis.actionsDueToday, 1);
  });

  it("generates executive briefing sections", () => {
    const briefing = buildCommandCenterExecutiveBriefing({
      kpis: buildCommandCenterKpis({
        bundle: sampleBundle(),
        riskSnapshot: sampleRiskSnapshot(),
        dailyActionPlan: sampleDailyPlan(),
      }),
      riskSnapshot: sampleRiskSnapshot(),
      autopilot: sampleAutopilot(),
      dailyActionPlan: sampleDailyPlan(),
      criticalAlerts: [sampleAlert()],
      referenceMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });

    assert.match(briefing.headline, /critical territories/i);
    assert.ok(briefing.topRisks.length > 0);
    assert.ok(briefing.recommendedActions.length > 0);
    assert.ok(briefing.expectedOutcomes.length > 0);
  });

  it("tracks productivity metrics from overlays and resolved actions", () => {
    const overlays: ExecutiveAlertStatusOverlay[] = [
      {
        alertId: "alert-1",
        userId: "user-1",
        status: "resolved",
        updatedAt: "2026-06-15T15:00:00.000Z",
      },
    ];
    const metrics = buildCommandCenterProductivityMetrics({
      statusOverlays: overlays,
      followUps: [
        sampleFollowUp({ completedAt: "2026-06-15T16:00:00.000Z" }),
      ],
      resolvedDailyActions: [sampleDailyAction({ status: "resolved" })],
      referenceMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });

    assert.equal(metrics.actionsCompletedToday, 1);
    assert.equal(metrics.followUpsResolved, 1);
    assert.equal(metrics.riskReductionAchieved, 80);
    assert.equal(metrics.coverageGained, 6);
    assert.equal(metrics.hiresInfluenced, 2);
  });

  it("loads drawer context with risk, follow-up, and linked entities", () => {
    const alert = sampleAlert();
    const item = buildAlertWorkQueueItem(alert, [], Date.parse("2026-06-15T12:00:00.000Z"));
    const context = buildDrawerContextForQueueItem({
      item,
      alerts: [alert],
      recommendations: [sampleRecommendation()],
      dailyActions: [sampleDailyAction()],
      followUps: [sampleFollowUp()],
      actionLogs: [],
      territoryRows: sampleRiskSnapshot().highestRiskTerritories,
    });

    assert.equal(context.alert?.id, "alert-1");
    assert.equal(context.linkedStores[0], "Store 101");
    assert.equal(context.linkedProjects[0], "Project Alpha");
    assert.ok(context.followUpHistory.length > 0);
    assert.ok(context.recommendedNextAction.length > 0);
    assert.equal(context.riskDetail?.riskLevel, "critical");
  });

  it("builds unified snapshot with work queue and drawer contexts", () => {
    const snapshot = buildUnifiedRecruitingCommandCenterSnapshot({
      bundle: sampleBundle(),
      followUps: [sampleFollowUp()],
      statusOverlays: [],
      actionLogs: [],
      referenceMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });

    assert.ok(snapshot.workQueue.length > 0);
    assert.ok(snapshot.leftColumn.overdueFollowUps.length > 0);
    assert.ok(snapshot.centerColumn.territoryRiskDashboard.length >= 0);
    assert.ok(snapshot.rightColumn.topRecommendations.length >= 0);
    assert.ok(Object.keys(snapshot.drawerContextsByQueueId).length > 0);
  });
});
