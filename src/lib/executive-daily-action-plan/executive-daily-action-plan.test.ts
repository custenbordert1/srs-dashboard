import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDailyActionExecutionContext,
  buildDailyActionPlanSnapshot,
  buildFollowUpPayloadFromDailyAction,
  classifyDailyActionBucket,
  computeDailyActionImpactTotals,
  dailyActionAlertId,
  groupDailyActionItems,
  recommendationIdFromDailyActionAlertId,
} from "@/lib/executive-daily-action-plan";
import { buildDailyActionPlanItem } from "@/lib/executive-daily-action-plan/group-daily-actions";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;

function sampleRecommendation(overrides: Partial<AutopilotRecommendation> = {}): AutopilotRecommendation {
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
    supportingMetrics: [],
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

function minimalBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates: [],
    workflows: {},
    opportunities: [],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: null,
      opportunities: [],
      executiveSummary: {
        totalOpenOpportunities: 0,
        highRiskProjectCount: 0,
        yellowRiskProjectCount: 0,
        zeroNearbyRepProjects: 0,
        averageCoverageScore: 0,
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

describe("executive daily action plan", () => {
  it("classifies recommendations into daily action buckets", () => {
    assert.equal(classifyDailyActionBucket(sampleRecommendation({ prioritizationScore: 80 })), "must-do-today");
    assert.equal(
      classifyDailyActionBucket(
        sampleRecommendation({
          prioritizationScore: 40,
          horizon: "quick-win",
          impactScore: 80,
        }),
      ),
      "must-do-today",
    );
    assert.equal(
      classifyDailyActionBucket(
        sampleRecommendation({
          prioritizationScore: 55,
          horizon: "long-term",
          impactScore: 50,
          opportunity: {
            ...sampleRecommendation().opportunity,
            currentRisk: 40,
          },
        }),
      ),
      "should-do-this-week",
    );
    assert.equal(
      classifyDailyActionBucket(
        sampleRecommendation({
          prioritizationScore: 30,
          horizon: "long-term",
          impactScore: 40,
          opportunity: {
            ...sampleRecommendation().opportunity,
            currentRisk: 30,
          },
        }),
      ),
      "monitor-only",
    );
  });

  it("groups daily action items by bucket", () => {
    const referenceMs = Date.parse("2026-06-15T12:00:00.000Z");
    const items = [
      buildDailyActionPlanItem({
        recommendation: sampleRecommendation({ id: "a", prioritizationScore: 80 }),
        alerts: [],
        statusByAlertId: {},
        referenceMs,
      }),
      buildDailyActionPlanItem({
        recommendation: sampleRecommendation({
          id: "b",
          prioritizationScore: 55,
          horizon: "long-term",
          impactScore: 50,
          opportunity: { ...sampleRecommendation().opportunity, currentRisk: 40 },
        }),
        alerts: [],
        statusByAlertId: {},
        referenceMs,
      }),
      buildDailyActionPlanItem({
        recommendation: sampleRecommendation({
          id: "c",
          prioritizationScore: 20,
          horizon: "long-term",
          impactScore: 30,
          opportunity: { ...sampleRecommendation().opportunity, currentRisk: 20 },
        }),
        alerts: [],
        statusByAlertId: {},
        referenceMs,
      }),
    ];
    const grouped = groupDailyActionItems(items);
    assert.equal(grouped.mustDoToday.length, 1);
    assert.equal(grouped.shouldDoThisWeek.length, 1);
    assert.equal(grouped.monitorOnly.length, 1);
    assert.equal(grouped.mustDoToday[0]?.links.recommendationId, "a");
  });

  it("computes impact totals for executive summary", () => {
    const referenceMs = Date.parse("2026-06-15T12:00:00.000Z");
    const items = [
      buildDailyActionPlanItem({
        recommendation: sampleRecommendation({
          id: "impact-1",
          estimatedOutcomeImprovement: 80,
          opportunity: {
            ...sampleRecommendation().opportunity,
            estimatedCoverageGain: 6,
            estimatedCandidateGain: 12,
          },
        }),
        alerts: [],
        statusByAlertId: {},
        referenceMs,
      }),
      buildDailyActionPlanItem({
        recommendation: sampleRecommendation({
          id: "impact-2",
          estimatedOutcomeImprovement: 60,
          opportunity: {
            ...sampleRecommendation().opportunity,
            estimatedCoverageGain: 4,
            estimatedCandidateGain: 8,
          },
        }),
        alerts: [],
        statusByAlertId: {},
        referenceMs,
      }),
    ];
    const totals = computeDailyActionImpactTotals(items);
    assert.equal(totals.projectedCoverageGain, 10);
    assert.equal(totals.projectedHireGain, 5);
    assert.equal(totals.riskReduction, 35);
  });

  it("builds follow-up payload from daily action items", () => {
    const item = buildDailyActionPlanItem({
      recommendation: sampleRecommendation({ entityType: "recruiter", entityLabel: "Alex Recruiter" }),
      alerts: [],
      statusByAlertId: {},
      referenceMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });
    const payload = buildFollowUpPayloadFromDailyAction(item);
    assert.equal(payload.alertId, dailyActionAlertId(item.links.recommendationId));
    assert.equal(payload.ownerKind, "recruiter");
    assert.equal(payload.ownerName, "Alex Recruiter");
    assert.equal(payload.priority, "critical");
    assert.match(payload.notes, /Territory risk/);
  });

  it("maps daily action alert ids for status and follow-up conversion", () => {
    const alertId = dailyActionAlertId("autopilot:territory:dm-1");
    assert.equal(alertId, "daily-action:autopilot:territory:dm-1");
    assert.equal(recommendationIdFromDailyActionAlertId(alertId), "autopilot:territory:dm-1");
  });

  it("builds execution context for deep-link navigation", () => {
    const item = buildDailyActionPlanItem({
      recommendation: sampleRecommendation(),
      alerts: [],
      statusByAlertId: {},
      referenceMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });
    const context = buildDailyActionExecutionContext(item);
    assert.equal(context.actionId, item.id);
    assert.equal(context.tabId, "predictive-territory-risk");
    assert.equal(context.elementId, "predictive-territory-risk-dashboard");
    assert.equal(context.recommendationId, item.links.recommendationId);
    assert.equal(context.bucket, "must-do-today");
  });

  it("builds snapshot from intelligence bundle without extra fetches", () => {
    const snapshot = buildDailyActionPlanSnapshot({ bundle: minimalBundle() });
    assert.equal(snapshot.planDate, "2026-06-15");
    assert.ok(snapshot.all.length >= 0);
    assert.equal(
      snapshot.mustDoToday.length + snapshot.shouldDoThisWeek.length + snapshot.monitorOnly.length,
      snapshot.all.length,
    );
  });
});
