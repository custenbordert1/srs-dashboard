import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import type { AuthSession } from "@/lib/auth/types";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import {
  buildDmActionQueue,
  buildDmDailyPlan,
  buildDmOperatingSystemSnapshot,
  buildRecruiterPerformance,
  buildTerritoryForecast,
  buildTerritoryHeatMap,
  filterAlertsForDmScope,
  filterWorkQueueForDmScope,
  isStateInDmScope,
  rankRecruitersByPerformance,
  resolveDmOperatingSystemScope,
  type DmRecruiterPerformanceRow,
} from "@/lib/dm-operating-system";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type { PredictiveTerritoryRiskRow, PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import {
  buildAlertWorkQueueItem,
  buildDailyActionWorkQueueItem,
  buildFollowUpWorkQueueItem,
  buildRecommendationWorkQueueItem,
} from "@/lib/unified-recruiting-command-center";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import { normalizeWorkflowRecord } from "@/lib/candidate-workflow-types";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;
const OTHER_DM = DISTRICT_MANAGERS[1]!;

function dmSession(dmName: string = SAMPLE_DM): AuthSession {
  return {
    userId: "dm-user",
    email: "dm@example.com",
    name: dmName,
    role: "dm",
    dmName,
    territoryStates: ["CO", "KS", "MO", "NE", "OK", "TX"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function adminSession(): AuthSession {
  return {
    userId: "admin-user",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    territoryStates: [],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function sampleBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [
      {
        jobId: "job-1",
        name: "Retail Rep",
        city: "Houston",
        state: "TX",
        zip: "77001",
        displayLocation: "Houston, TX",
        locationSource: "top_level",
        status: "published",
        createdDate: "2026-06-01T00:00:00.000Z",
        updatedDate: "2026-06-10T00:00:00.000Z",
      },
    ],
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
      territoryStates: ["TX"],
      opportunities: [],
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

function sampleAlert(overrides: Partial<ExecutiveAlert> = {}): ExecutiveAlert {
  return {
    id: "alert-tx",
    title: "TX coverage gap",
    description: "Store needs attention",
    severity: "critical",
    category: "coverage",
    impactScore: 90,
    recommendedAction: "notify-dm",
    destination: { tabId: "executive-alerts", label: "Alerts" },
    automationKind: "coverage-review",
    manualOnly: true,
    createdAt: "2026-06-15T08:00:00.000Z",
    reason: "Zero applicants",
    context: {
      dmName: SAMPLE_DM,
      state: "TX",
      linkedCandidates: [],
      linkedReps: [],
      dataSources: ["breezy"],
    },
    ...overrides,
  };
}

function sampleStoreRow(overrides: Partial<PredictiveTerritoryRiskRow> = {}): PredictiveTerritoryRiskRow {
  return {
    entityId: "store:1",
    entityType: "store-cluster",
    label: "Store 101 · Alpha",
    dmName: SAMPLE_DM,
    states: ["TX"],
    riskScore: 85,
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
    openCalls: 3,
    coveragePercent: 20,
    pipelineDepth: 0,
    alertCount: 2,
    followUpCount: 1,
    recommendations: [],
    navigation: { tabId: "predictive-territory-risk", label: "Open" },
    ...overrides,
  };
}

describe("dm operating system permissions", () => {
  it("scopes DM sessions to assigned territory states", () => {
    const scope = resolveDmOperatingSystemScope(dmSession());
    assert.equal(scope.scopedToTerritory, true);
    assert.ok(scope.territoryStates.includes("TX"));
    assert.equal(scope.dmName, SAMPLE_DM);
  });

  it("allows admin sessions without territory scoping", () => {
    const scope = resolveDmOperatingSystemScope(adminSession());
    assert.equal(scope.scopedToTerritory, false);
  });

  it("enforces state-level territory filtering", () => {
    const scope = resolveDmOperatingSystemScope(dmSession());
    assert.equal(isStateInDmScope("TX", scope), true);
    assert.equal(isStateInDmScope("NY", scope), false);
  });
});

describe("dm operating system territory filtering", () => {
  it("filters alerts to DM territory", () => {
    const scope = resolveDmOperatingSystemScope(dmSession());
    const filtered = filterAlertsForDmScope(
      [sampleAlert(), sampleAlert({ id: "alert-ny", context: { dmName: OTHER_DM, state: "NY", linkedCandidates: [], linkedReps: [], dataSources: [] } })],
      scope,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.context?.state, "TX");
  });

  it("filters work queue items to DM scope", () => {
    const scope = resolveDmOperatingSystemScope(dmSession());
    const referenceMs = Date.parse("2026-06-15T12:00:00.000Z");
    const inScope = buildAlertWorkQueueItem(sampleAlert(), [], referenceMs);
    const outScope = buildAlertWorkQueueItem(
      sampleAlert({
        id: "alert-other",
        context: { dmName: OTHER_DM, state: "NY", linkedCandidates: [], linkedReps: [], dataSources: [] },
      }),
      [],
      referenceMs,
    );
    const filtered = filterWorkQueueForDmScope([inScope, outScope], scope);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.sourceAlertId, "alert-tx");
  });
});

describe("dm operating system action prioritization", () => {
  it("sorts DM action queue by impact and priority", () => {
    const scope = resolveDmOperatingSystemScope(dmSession());
    const referenceMs = Date.parse("2026-06-15T12:00:00.000Z");
    const recommendation: AutopilotRecommendation = {
      id: "rec-1",
      kind: "escalate-to-dm",
      title: "Escalate",
      entityType: "dm",
      entityId: `dm:${SAMPLE_DM}`,
      entityLabel: SAMPLE_DM,
      dmName: SAMPLE_DM,
      impactScore: 60,
      confidenceScore: 55,
      estimatedOutcomeImprovement: 50,
      reasoning: "Risk",
      supportingMetrics: [],
      opportunity: {
        currentRisk: 70,
        potentialImprovement: 10,
        estimatedCandidateGain: 5,
        estimatedCoverageGain: 4,
        estimatedCompletionGain: 2,
        expectedRoiScore: 50,
      },
      prioritizationScore: 55,
      horizon: "quick-win",
      navigation: { tabId: "recruiting-autopilot", label: "Open" },
    };
    const followUp: ExecutiveAlertFollowUp = {
      id: "fu-1",
      alertId: "alert-tx",
      ownerKind: "dm",
      ownerName: SAMPLE_DM,
      dueDate: "2026-06-14T12:00:00.000Z",
      priority: "critical",
      createdAt: "2026-06-13T12:00:00.000Z",
      createdByUserId: "u1",
      createdByName: "Exec",
    };
    const dailyAction: DailyActionPlanItem = {
      id: "daily-1",
      alertId: "daily-action:rec-1",
      bucket: "must-do-today",
      title: "Daily action",
      owner: SAMPLE_DM,
      ownerKind: "dm",
      dueDate: "2026-06-15T23:59:59.000Z",
      expectedImpact: 95,
      expectedCoverageGain: 8,
      expectedHireGain: 2,
      reasoning: "Critical",
      links: {
        recommendationId: "rec-1",
        recommendationKind: "escalate-to-dm",
        recommendationTitle: "Escalate",
        riskScore: 80,
      },
      navigation: { tabId: "daily-action-plan", label: "Open" },
      status: "new",
      recommendation,
    };

    const queue = buildDmActionQueue({
      workQueue: [
        buildRecommendationWorkQueueItem(recommendation, referenceMs),
        buildFollowUpWorkQueueItem(followUp, sampleAlert(), [], referenceMs),
        buildDailyActionWorkQueueItem(dailyAction, referenceMs),
        buildAlertWorkQueueItem(sampleAlert({ impactScore: 70 }), [], referenceMs),
      ],
      scope,
    });

    assert.ok(queue.length >= 2);
    assert.equal(queue[0]?.impactScore >= (queue[1]?.impactScore ?? 0), true);
  });
});

describe("dm operating system recruiter rankings", () => {
  it("ranks recruiters and highlights tiers", () => {
    const rows: DmRecruiterPerformanceRow[] = [
      {
        recruiter: "Top Rep",
        openReqs: 4,
        candidatePipeline: 20,
        followUpCompletionPercent: 95,
        hiringVelocity: 3,
        coverageContribution: 80,
        performanceTier: "top",
      },
      {
        recruiter: "Needs Help",
        openReqs: 6,
        candidatePipeline: 2,
        followUpCompletionPercent: 20,
        hiringVelocity: 0,
        coverageContribution: 10,
        performanceTier: "needs-support",
      },
    ];
    const ranked = rankRecruitersByPerformance(rows);
    assert.equal(ranked[0]?.performanceTier, "top");
    assert.equal(ranked.at(-1)?.performanceTier, "needs-support");
  });

  it("builds recruiter performance from bundle workflows", () => {
    const bundle = sampleBundle();
    bundle.candidates = [
      {
        candidateId: "c1",
        firstName: "A",
        lastName: "B",
        email: "a@b.com",
        phone: "",
        source: "web",
        stage: "interviewing",
        appliedDate: "2026-06-14T00:00:00.000Z",
        createdDate: "2026-06-14T00:00:00.000Z",
        addedDate: "2026-06-14T00:00:00.000Z",
        updatedDate: "2026-06-14T00:00:00.000Z",
        addedDateSource: "creation_date",
        positionId: "job-1",
        positionName: "Retail Rep",
        city: "Houston",
        state: "TX",
        zipCode: "77001",
        resumeText: "",
        hasResume: false,
      },
    ];
    bundle.workflows = {
      c1: normalizeWorkflowRecord("c1", {
        assignedRecruiter: "Jordan Miles",
      }),
    };
    const result = buildRecruiterPerformance({
      bundle,
      followUps: [],
      scope: resolveDmOperatingSystemScope(dmSession()),
    });
    assert.ok(result.recruiters.length >= 1);
    assert.ok(result.recruiters.some((row) => row.recruiter === "Jordan Miles"));
  });
});

describe("dm operating system forecast generation", () => {
  it("generates 7/14/30 day territory forecasts", () => {
    const riskSnapshot: PredictiveTerritoryRiskSnapshot = {
      generatedAt: "2026-06-15T12:00:00.000Z",
      executiveSummary: {
        totalCriticalTerritories: 1,
        totalHighRiskTerritories: 1,
        projectsAtRisk: 1,
        predictedCoverageGap: 20,
      },
      highestRiskTerritories: [sampleStoreRow({ entityType: "dm", label: SAMPLE_DM })],
      healthiestTerritories: [],
      forecasts: [],
      territories: [sampleStoreRow({ entityType: "dm", label: SAMPLE_DM })],
      projects: [],
      storeClusters: [],
    };
    const forecast = buildTerritoryForecast({
      riskSnapshot,
      scope: resolveDmOperatingSystemScope(dmSession()),
      baseCoveragePercent: 42,
      baseOpenCalls: 12,
    });
    assert.equal(forecast.length, 3);
    assert.deepEqual(
      forecast.map((row) => row.horizon),
      ["7d", "14d", "30d"],
    );
    assert.ok(forecast[2]!.coveragePercent >= forecast[0]!.coveragePercent);
  });
});

describe("dm operating system snapshot", () => {
  it("builds end-to-end DM operating system snapshot", () => {
    const snapshot = buildDmOperatingSystemSnapshot({
      session: dmSession(),
      bundle: sampleBundle(),
      followUps: [],
      statusOverlays: [],
      actionLogs: [],
    });
    assert.equal(snapshot.scope.dmName, SAMPLE_DM);
    assert.ok(snapshot.kpis.territoryCoveragePercent >= 0);
    assert.ok(Array.isArray(snapshot.actionQueue));
    assert.ok(Array.isArray(snapshot.dailyPlan));
    assert.ok(snapshot.forecast.length === 3);
  });

  it("builds territory heat map with zero-pipeline classification", () => {
    const heatMap = buildTerritoryHeatMap({
      storeClusters: [sampleStoreRow()],
      projects: [],
      scope: resolveDmOperatingSystemScope(dmSession()),
    });
    assert.equal(heatMap.stores[0]?.healthStatus, "zero-pipeline");
    assert.ok(heatMap.filters.states.includes("TX"));
  });

  it("limits daily plan to top 10 territory actions", () => {
    const scope = resolveDmOperatingSystemScope(dmSession());
    const recommendation: AutopilotRecommendation = {
      id: "rec-base",
      kind: "refresh-job-posting",
      title: "Refresh posting",
      entityType: "territory",
      entityId: "territory:tx",
      entityLabel: SAMPLE_DM,
      dmName: SAMPLE_DM,
      impactScore: 50,
      confidenceScore: 50,
      estimatedOutcomeImprovement: 40,
      reasoning: "Stale posting",
      supportingMetrics: [],
      opportunity: {
        currentRisk: 50,
        potentialImprovement: 10,
        estimatedCandidateGain: 3,
        estimatedCoverageGain: 2,
        estimatedCompletionGain: 1,
        expectedRoiScore: 40,
      },
      prioritizationScore: 50,
      horizon: "quick-win",
      navigation: { tabId: "recruiting-autopilot", label: "Open" },
    };
    const actions: DailyActionPlanItem[] = Array.from({ length: 12 }, (_, index) => ({
      id: `daily-${index}`,
      alertId: `daily-action:${index}`,
      bucket: "must-do-today" as const,
      title: `Action ${index}`,
      owner: SAMPLE_DM,
      ownerKind: "dm" as const,
      dueDate: "2026-06-15T23:59:59.000Z",
      expectedImpact: 100 - index,
      expectedCoverageGain: 5,
      expectedHireGain: 1,
      reasoning: "Territory priority",
      links: {
        recommendationId: "rec-base",
        recommendationKind: "refresh-job-posting",
        recommendationTitle: "Refresh",
        riskScore: 50,
      },
      navigation: { tabId: "daily-action-plan", label: "Open" },
      status: "new" as const,
      recommendation,
    }));
    const plan = buildDmDailyPlan({
      dailyActionPlan: {
        generatedAt: "2026-06-15T12:00:00.000Z",
        planDate: "2026-06-15",
        executiveSummary: {
          criticalActionsToday: 12,
          projectedCoverageGain: 20,
          projectedHireGain: 5,
          riskReduction: 10,
          mustDoCount: 12,
          shouldDoCount: 0,
          monitorCount: 0,
        },
        topActionsToday: actions.slice(0, 5),
        mustDoToday: actions,
        shouldDoThisWeek: [],
        monitorOnly: [],
        all: actions,
      },
      scope,
    });
    assert.equal(plan.length, 10);
    assert.equal(plan[0]?.rank, 1);
  });
});
