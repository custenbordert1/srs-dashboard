import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAlertSnapshot,
  buildAlerts,
  buildPrioritizedAlertSnapshot,
  computeImpactScore,
  projectCoverageSeverity,
  recruiterWorkloadSeverity,
  territoryCoverageSeverity,
  type AlertBuildContext,
} from "@/lib/alerts";
import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import { buildExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center";
import { buildPlacementCommandCenterSnapshot } from "@/lib/placement-command-center/build-placement-command-center-snapshot";
import { buildTerritoryActionCenterSnapshot } from "@/lib/territory-action-engine";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";

function sampleAlert(overrides: Partial<ExecutiveAlert> = {}): ExecutiveAlert {
  return {
    id: "test:1",
    title: "Test alert",
    description: "Test description",
    severity: "high",
    category: "project",
    impactScore: 74,
    recommendedAction: "assign-recruiter",
    destination: { tabId: "action-center", label: "Territory Action Engine" },
    automationKind: "assign-recruiter",
    manualOnly: true,
    createdAt: new Date().toISOString(),
    reason: "Test reason",
    ...overrides,
  };
}

describe("alerts", () => {
  it("maps project coverage thresholds", () => {
    assert.equal(projectCoverageSeverity(15), "critical");
    assert.equal(projectCoverageSeverity(35), "high");
    assert.equal(projectCoverageSeverity(55), null);
  });

  it("maps territory coverage thresholds", () => {
    assert.equal(territoryCoverageSeverity(20, 50), "critical");
    assert.equal(territoryCoverageSeverity(50, 65), "high");
    assert.equal(territoryCoverageSeverity(70, 40), null);
  });

  it("maps recruiter workload thresholds", () => {
    assert.equal(recruiterWorkloadSeverity(85), "critical");
    assert.equal(recruiterWorkloadSeverity(60), "high");
    assert.equal(recruiterWorkloadSeverity(40), null);
  });

  it("computes impact score with severity weighting", () => {
    const critical = computeImpactScore({ severity: "critical", businessImpact: 20, openCalls: 3 });
    const low = computeImpactScore({ severity: "low" });
    assert.ok(critical > low);
    assert.ok(critical <= 100);
  });

  it("returns top 10 critical and top 25 overall actions", () => {
    const alerts = [
      ...Array.from({ length: 12 }, (_, index) =>
        sampleAlert({
          id: `critical:${index}`,
          severity: "critical",
          impactScore: 90 - index,
        }),
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        sampleAlert({
          id: `high:${index}`,
          severity: "high",
          impactScore: 70 - index,
        }),
      ),
    ];

    const snapshot = buildPrioritizedAlertSnapshot(alerts, new Date().toISOString());
    assert.equal(snapshot.topCritical.length, 10);
    assert.equal(snapshot.topActions.length, 25);
    assert.equal(snapshot.meta.totalCount, 32);
    assert.equal(snapshot.meta.bySeverity.critical, 12);
  });

  it("builds categorized alerts from intelligence-derived snapshots", () => {
    const fetchedAt = "2026-05-28T12:00:00.000Z";
    const coverage: CoverageRiskSnapshot = {
      fetchedAt,
      territoryStates: null,
      opportunities: [
        {
          opportunityId: "opp-1",
          projectName: "Houston Retail",
          client: "Acme",
          storeName: "Store 101",
          city: "Houston",
          state: "TX",
          territoryOwner: "Taylor",
          priority: "high",
          nearby: { within10: 0, within25: 0, within50: 0, activeWithin50: 0, inactiveWithin50: 0 },
          activeRepDensity: 0,
          skillMatchScore: 20,
          recentLoginScore: 10,
          territoryAlignmentScore: 30,
          pipelineScore: 25,
          coverageScore: 14,
          staffingRisk: "RED",
          recommendedAction: "Create ads and assign recruiter",
          topRecommendedReps: [],
        },
      ],
      executiveSummary: {
        totalOpenOpportunities: 12,
        highRiskProjectCount: 4,
        yellowRiskProjectCount: 2,
        zeroNearbyRepProjects: 2,
        averageCoverageScore: 18,
        lowDensityStates: [],
        highOpportunityLowRepMarkets: [],
      },
      dmAlerts: { highRiskProjects: [], noNearbyReps: [], recruitingUrgency: [], bestAvailableReps: [] },
    };

    const actionContext = {
      jobs: [],
      candidates: [],
      workflows: {},
      fetchedAt,
      coverage,
      opportunities: [],
      activeReps: [],
      workforceQueue: [],
    };

    const alertContext: AlertBuildContext = {
      fetchedAt,
      coverage,
      candidates: [],
      workflows: {},
      executive: buildExecutiveOperationsCenterSnapshot(actionContext),
      placement: buildPlacementCommandCenterSnapshot(actionContext),
      actionCenter: buildTerritoryActionCenterSnapshot(actionContext),
    };

    const snapshot = buildPrioritizedAlertSnapshot(buildAlerts(alertContext), fetchedAt);
    assert.ok(snapshot.meta.totalCount > 0);
    assert.ok(snapshot.topActions.length <= 25);
    assert.ok(snapshot.criticalAlerts.length > 0);
    assert.ok(["project", "coverage"].includes(snapshot.criticalAlerts[0]?.category ?? ""));
  });

  it("buildAlertSnapshot composes from route bundle shape without extra fetches", () => {
    const fetchedAt = "2026-05-28T12:00:00.000Z";
    const coverage: CoverageRiskSnapshot = {
      fetchedAt,
      territoryStates: null,
      opportunities: [],
      executiveSummary: {
        totalOpenOpportunities: 0,
        highRiskProjectCount: 0,
        yellowRiskProjectCount: 0,
        zeroNearbyRepProjects: 0,
        averageCoverageScore: 72,
        lowDensityStates: [],
        highOpportunityLowRepMarkets: [],
      },
      dmAlerts: { highRiskProjects: [], noNearbyReps: [], recruitingUrgency: [], bestAvailableReps: [] },
    };

    const snapshot = buildAlertSnapshot({
      bundle: {
        jobs: [],
        jobsResult: {
          ok: true,
          jobs: [],
          fetchedAt,
          companyId: "co",
          state: "published",
        },
        candidates: [],
        workflows: {},
        opportunities: [],
        activeReps: [],
        coverage,
        fetchedAt,
        candidatesResult: {
          ok: true,
          candidates: [],
          fetchedAt,
          companyId: "co",
        },
        melOk: true,
        intelligenceCache: {
          cacheStatus: "fresh",
          snapshotAgeMs: 1000,
          isStale: false,
          backgroundRefresh: false,
          lastRefreshAt: fetchedAt,
          recordCounts: {
            jobCount: 0,
            candidateCount: 0,
            opportunityCount: 0,
            workflowCount: 0,
          },
        },
      },
    });

    assert.equal(typeof snapshot.generatedAt, "string");
    assert.ok(Array.isArray(snapshot.topActions));
  });
});
