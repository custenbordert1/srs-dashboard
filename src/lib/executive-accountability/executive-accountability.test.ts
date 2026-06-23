import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutiveForecastRecommendation } from "@/lib/executive-recruiting-forecast";
import {
  appendAuditEntry,
  normalizeExecutiveTrackedAction,
} from "@/lib/executive-accountability/action-audit";
import {
  calculateCompletionRate,
  detectOverdueActions,
  detectStaleActions,
  groupActionsByOwner,
  summarizeActionStatus,
} from "@/lib/executive-accountability/accountability-engine";
import { buildExecutiveAccountabilitySnapshot } from "@/lib/executive-accountability/build-snapshot";
import {
  convertForecastRecommendationToAction,
  dueDateForPriority,
  mergeForecastIntoExistingAction,
  syncActionsFromForecastRecommendations,
} from "@/lib/executive-accountability/convert-recommendations";
import { buildForecastBacktestSummary } from "@/lib/executive-accountability/forecast-backtest";
import { updateExecutiveAction } from "@/lib/executive-accountability/recommendation-store";
import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";
import { buildExecutiveWeeklySummary } from "@/lib/executive-accountability/weekly-summary";
import { buildWeeklyExecutiveNarrative } from "@/lib/executive-accountability/weekly-narrative";
import type { ExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";
import {
  installIsolatedRecruitingDataDir,
  recruitingStorePath,
  RECRUITING_STORE_FILES,
} from "@/lib/test/recruiting-test-isolation";

const now = "2026-06-15T12:00:00.000Z";
const referenceMs = new Date(now).getTime();

function forecastRec(
  overrides: Partial<ExecutiveForecastRecommendation> = {},
): ExecutiveForecastRecommendation {
  return {
    id: "p44-rec-1",
    kind: "escalate-dm-territory",
    title: "Escalate DM One territory risk",
    rationale: "Open store calls exceed active reps",
    expectedImpact: "Reduce projected shortage",
    priority: "critical",
    territoryLabel: "TX",
    owner: "DM One",
    ...overrides,
  };
}

function trackedAction(overrides: Partial<ExecutiveTrackedAction> = {}): ExecutiveTrackedAction {
  return normalizeExecutiveTrackedAction({
    recommendationId: "action-1",
    sourcePhase: "P44",
    sourceModule: "executive-recruiting-forecast",
    sourceForecastKey: "p44:territory-escalation:dm-one:tx",
    recommendationKind: "escalate-dm-territory",
    territoryLabel: "TX",
    title: "Escalate DM One territory risk",
    priority: "critical",
    owner: "DM One",
    ownerManuallyAssigned: false,
    dueDate: "2026-06-18T12:00:00.000Z",
    dueDateManuallySet: false,
    status: "open",
    expectedImpact: "Reduce projected shortage",
    outcomeNotes: null,
    actualOutcome: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    archivedReason: null,
    notes: [],
    operationalEvidence: [],
    ...overrides,
  });
}

function minimalForecast(): ExecutiveRecruitingForecastSnapshot {
  return {
    generatedAt: now,
    dataTrust: "high",
    forecastConfidence: "moderate",
    executiveSummary: {
      territoriesAtRisk: 2,
      overloadedRecruiters: 1,
      overloadedDms: 0,
      topRiskTerritory: { dmName: "DM One", territoryLabel: "TX" },
      topRecommendation: forecastRec(),
      forecastConfidence: "moderate",
      narrative: "Test narrative",
    },
    assumptions: [],
    partialSync: false,
    kpis: {
      projectedHires30: 4,
      projectedHires60: 8,
      projectedHires90: 12,
      projectedApplicants90: 40,
      overloadedRecruiters: 1,
      overloadedDms: 0,
      territoriesAtRisk: 2,
      projectsAtRisk: 1,
    },
    hiringForecasts: [],
    weeklyHireForecast: [],
    recruiterCapacity: [],
    dmCapacity: [],
    territoryShortages: [],
    projectCompletionRisks: [],
    recommendations: [forecastRec()],
  };
}

describe("executive accountability", () => {
  it("converts P44 recommendations into trackable executive actions", () => {
    const action = convertForecastRecommendationToAction(forecastRec(), now);
    assert.equal(action.sourcePhase, "P44");
    assert.equal(action.sourceModule, "executive-recruiting-forecast");
    assert.equal(action.sourceForecastKey, "p44:territory-escalation:dm-one:tx");
    assert.equal(action.status, "open");
    assert.equal(action.owner, "DM One");
    assert.equal(action.priority, "critical");
    assert.ok(action.recommendationId.length > 0);
    assert.equal(dueDateForPriority("critical", referenceMs).slice(0, 10), "2026-06-18");
  });

  it("syncs forecast recommendations without duplicating existing keys", () => {
    const existing = trackedAction();
    const synced = syncActionsFromForecastRecommendations({
      existingActions: [existing],
      recommendations: [forecastRec({ title: "Updated title" })],
      referenceIso: now,
    });
    assert.equal(synced.length, 1);
    assert.equal(synced[0]!.recommendationId, "action-1");
    assert.equal(synced[0]!.title, "Updated title");
  });

  it("archives open actions when forecast recommendations churn instead of dropping them", () => {
    const synced = syncActionsFromForecastRecommendations({
      existingActions: [trackedAction({ status: "open" })],
      recommendations: [],
      referenceIso: now,
    });
    assert.equal(synced.length, 1);
    assert.equal(synced[0]!.status, "archived");
    assert.equal(synced[0]!.archivedReason, "forecast_recommendation_churned");
  });

  it("preserves manually assigned owner and due date during forecast merge", () => {
    const merged = mergeForecastIntoExistingAction(
      trackedAction({
        owner: "Steve",
        ownerManuallyAssigned: true,
        dueDate: "2026-07-01T12:00:00.000Z",
        dueDateManuallySet: true,
      }),
      forecastRec({ owner: "DM Two", priority: "low" }),
      now,
    );
    assert.equal(merged.owner, "Steve");
    assert.equal(merged.dueDate, "2026-07-01T12:00:00.000Z");
  });

  it("detects overdue recommendations", () => {
    const overdue = detectOverdueActions(
      [
        trackedAction({ dueDate: "2026-06-10T12:00:00.000Z", status: "open" }),
        trackedAction({ recommendationId: "action-2", dueDate: "2026-06-20T12:00:00.000Z" }),
      ],
      referenceMs,
    );
    assert.equal(overdue.length, 1);
    assert.equal(overdue[0]!.recommendationId, "action-1");
  });

  it("summarizes open, in progress, completed, and overdue counts", () => {
    const summary = summarizeActionStatus(
      [
        trackedAction({ status: "open" }),
        trackedAction({ recommendationId: "a2", status: "in_progress" }),
        trackedAction({ recommendationId: "a3", status: "completed" }),
        trackedAction({
          recommendationId: "a4",
          status: "open",
          dueDate: "2026-06-01T12:00:00.000Z",
        }),
        trackedAction({ recommendationId: "a5", status: "archived" }),
      ],
      referenceMs,
    );
    assert.equal(summary.open, 2);
    assert.equal(summary.inProgress, 1);
    assert.equal(summary.completed, 1);
    assert.equal(summary.archived, 1);
    assert.equal(summary.overdue, 1);
    assert.equal(calculateCompletionRate([
      trackedAction({ status: "completed" }),
      trackedAction({ recommendationId: "a2", status: "open" }),
    ]), 50);
  });

  it("groups recommendations by owner", () => {
    const groups = groupActionsByOwner(
      [
        trackedAction({ owner: "DM One" }),
        trackedAction({ recommendationId: "a2", owner: "Alex", status: "in_progress" }),
        trackedAction({
          recommendationId: "a3",
          owner: "DM One",
          dueDate: "2026-06-01T12:00:00.000Z",
        }),
      ],
      referenceMs,
    );
    assert.equal(groups.length, 2);
    const dmOne = groups.find((row) => row.owner === "DM One");
    assert.ok(dmOne);
    assert.equal(dmOne!.open, 2);
    assert.equal(dmOne!.overdue, 1);
  });

  it("detects stale open actions", () => {
    const stale = detectStaleActions(
      [trackedAction({ updatedAt: "2026-05-20T12:00:00.000Z" })],
      referenceMs,
    );
    assert.equal(stale.length, 1);
  });

  it("builds weekly narrative with trust and confidence labels", () => {
    const narrative = buildWeeklyExecutiveNarrative({
      forecast: minimalForecast(),
      previousHistory: {
        id: "h1",
        capturedAt: "2026-06-08T12:00:00.000Z",
        projectedHires30: 2,
        projectedHires60: 5,
        projectedHires90: 9,
        territoriesAtRisk: 1,
        activeRepCount: 10,
        dataTrust: "partial",
        forecastConfidence: "low",
      },
      statusSummary: summarizeActionStatus([]),
      overdueActions: [],
      completedSinceLast: [],
      generatedAt: now,
    });
    assert.match(narrative.headline, /Escalate DM One/);
    assert.ok(narrative.whatChanged.some((line) => line.includes("30-day hire projection")));
    assert.equal(narrative.dataTrustLabel, "Healthy sync");
    assert.equal(narrative.forecastConfidenceLabel, "Moderate");
    assert.equal(narrative.topRiskThisWeek, "DM One (TX) — 2 territories at risk nationwide");
  });

  it("builds executive weekly summary with opened, completed, overdue, archived, and blockers", () => {
    const summary = buildExecutiveWeeklySummary({
      actions: [
        trackedAction({ createdAt: now, status: "open", priority: "critical" }),
        trackedAction({
          recommendationId: "a2",
          createdAt: "2026-06-01T12:00:00.000Z",
          completedAt: now,
          status: "completed",
        }),
        trackedAction({
          recommendationId: "a3",
          createdAt: "2026-06-01T12:00:00.000Z",
          archivedAt: now,
          status: "archived",
        }),
      ],
      overdueCount: 1,
      referenceMs,
    });
    assert.equal(summary.opened, 1);
    assert.equal(summary.completed, 1);
    assert.equal(summary.archived, 1);
    assert.equal(summary.overdue, 1);
    assert.ok(summary.topBlockers.length > 0);
  });

  it("shows not enough history for forecast backtest empty state", () => {
    const empty = buildForecastBacktestSummary({ history: [], currentActiveRepCount: 12 });
    assert.equal(empty.status, "not_enough_history");
    assert.match(empty.message, /Not enough history yet/);

    const single = buildForecastBacktestSummary({
      history: [
        {
          id: "h1",
          capturedAt: now,
          projectedHires30: 4,
          projectedHires60: 8,
          projectedHires90: 12,
          territoriesAtRisk: 2,
          activeRepCount: 10,
          dataTrust: "high",
          forecastConfidence: "moderate",
        },
      ],
      currentActiveRepCount: 12,
      referenceMs,
    });
    assert.equal(single.status, "not_enough_history");
    assert.equal(single.rows[0]!.status, "pending");
  });

  it("builds accountability snapshot from forecast and empty store", () => {
    const { snapshot } = buildExecutiveAccountabilitySnapshot({
      forecast: minimalForecast(),
      workflows: {},
      store: { actions: [], forecastHistory: [], auditLog: [], updatedAt: now },
      generatedAt: now,
    });
    assert.equal(snapshot.actions.length, 1);
    assert.equal(snapshot.statusSummary.open, 1);
    assert.equal(snapshot.weeklyNarrative.topActionRequired, "Escalate DM One territory risk (critical priority)");
    assert.equal(snapshot.forecastBacktest.status, "not_enough_history");
    assert.ok(snapshot.weeklySummary);
    assert.ok(snapshot.operatingRhythm.weeklyPacket);
    assert.ok(snapshot.operatingRhythm.emailMarkdown.includes("Executive Summary"));
  });

  it("records audit trail entries when action fields change", async () => {
    const isolation = await installIsolatedRecruitingDataDir("srs-ea-");
    try {
      const file = {
        actions: [trackedAction()],
        forecastHistory: [],
        auditLog: [],
        updatedAt: now,
      };
      const priorWrite = await import("node:fs/promises").then((m) => m.writeFile);
      const storePath = recruitingStorePath(RECRUITING_STORE_FILES.accountability);
      await priorWrite(storePath, JSON.stringify(file, null, 2), "utf8");

      const result = await updateExecutiveAction(
        "action-1",
        { status: "in_progress", owner: "Bill", outcomeNotes: "Escalated to DM" },
        { displayName: "Steve" },
      );
      assert.ok(result.action);
      assert.ok(result.auditLog.some((row) => row.field === "status" && row.newValue === "in_progress"));
      assert.ok(result.auditLog.some((row) => row.field === "owner" && row.newValue === "Bill"));
      assert.ok(result.auditLog.every((row) => row.changedBy === "Steve"));
    } finally {
      await isolation.restore();
    }
  });

  it("appends audit entries with old and new values", () => {
    const log = appendAuditEntry([], {
      recommendationId: "action-1",
      changedBy: "Ops Director",
      field: "status",
      oldValue: "open",
      newValue: "completed",
      changedAt: now,
    });
    assert.equal(log.length, 1);
    assert.equal(log[0]!.oldValue, "open");
    assert.equal(log[0]!.newValue, "completed");
  });
});
