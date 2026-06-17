import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutiveForecastRecommendation } from "@/lib/executive-recruiting-forecast";
import { appendAuditEntry } from "@/lib/executive-accountability/action-audit";
import {
  buildAuditCenterRows,
  filterAuditCenterRows,
} from "@/lib/executive-accountability/audit-center";
import { buildExecutiveAccountabilitySnapshot } from "@/lib/executive-accountability/build-snapshot";
import { detectForecastChanges } from "@/lib/executive-accountability/forecast-changes";
import { formatExecutiveEmailMarkdown } from "@/lib/executive-accountability/executive-email-export";
import {
  buildOverdueEscalationDashboard,
  overdueEscalationBucket,
} from "@/lib/executive-accountability/overdue-escalation";
import type { ExecutiveTrackedAction, ForecastHistoryEntry } from "@/lib/executive-accountability/types";
import { buildExecutiveWeeklyPacket } from "@/lib/executive-accountability/weekly-executive-packet";
import type { ExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";

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
  return {
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
    dueDate: "2026-06-10T12:00:00.000Z",
    dueDateManuallySet: false,
    status: "open",
    expectedImpact: "Reduce projected shortage",
    outcomeNotes: null,
    actualOutcome: null,
    createdAt: "2026-06-14T12:00:00.000Z",
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    archivedReason: null,
    notes: [],
    operationalEvidence: [],
    ...overrides,
  };
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

function priorHistory(overrides: Partial<ForecastHistoryEntry> = {}): ForecastHistoryEntry {
  return {
    id: "hist-1",
    capturedAt: "2026-06-08T12:00:00.000Z",
    projectedHires30: 3,
    projectedHires60: 7,
    projectedHires90: 11,
    territoriesAtRisk: 3,
    activeRepCount: 10,
    dataTrust: "moderate",
    forecastConfidence: "low",
    overloadedRecruiters: 2,
    overloadedDms: 1,
    ...overrides,
  };
}

describe("executive accountability operating rhythm (P47)", () => {
  it("builds weekly executive packet grouped by priority, owner, and week boundaries", () => {
    const packet = buildExecutiveWeeklyPacket({
      forecast: minimalForecast(),
      actions: [
        trackedAction({ priority: "critical", status: "open", createdAt: now }),
        trackedAction({
          recommendationId: "action-2",
          owner: "Bill",
          priority: "high",
          status: "completed",
          createdAt: "2026-06-01T12:00:00.000Z",
          completedAt: now,
        }),
        trackedAction({
          recommendationId: "action-3",
          owner: "Bill",
          createdAt: now,
          status: "open",
          priority: "medium",
        }),
      ],
      overdueActions: [trackedAction()],
      previousHistory: priorHistory(),
      generatedAt: now,
    });

    assert.equal(packet.openActionsByPriority.critical.length, 1);
    assert.equal(packet.openActionsByPriority.medium.length, 1);
    assert.ok(packet.overdueByOwner["DM One"]);
    assert.ok(packet.completedThisWeekByOwner["Bill"]);
    assert.equal(packet.newlyOpened.length, 2);
    assert.ok(packet.narrative.summaryParagraph.includes("open actions"));
    assert.ok(packet.topRisks.some((risk) => risk.includes("DM One")));
  });

  it("detects forecast changes vs prior snapshot", () => {
    const changes = detectForecastChanges({
      forecast: minimalForecast(),
      previousHistory: priorHistory(),
    });

    assert.equal(changes.hasPriorSnapshot, true);
    assert.ok(changes.lines.some((line) => line.label === "30-day hire forecast"));
    assert.ok(changes.lines.some((line) => line.label === "Territories at risk"));
    assert.ok(changes.lines.some((line) => line.label === "Overloaded recruiters"));
    assert.ok(changes.worsened.some((line) => line.includes("Data trust")));
  });

  it("aggregates audit rows and filters by owner and status", () => {
    const actions = [
      trackedAction({ owner: "DM One", status: "in_progress" }),
      trackedAction({ recommendationId: "action-2", owner: "Bill", status: "open" }),
    ];
    const auditLog = appendAuditEntry(
      appendAuditEntry([], {
        recommendationId: "action-1",
        changedBy: "Steve",
        field: "status",
        oldValue: "open",
        newValue: "in_progress",
        changedAt: now,
      }),
      {
        recommendationId: "action-2",
        changedBy: "Ops Director",
        field: "owner",
        oldValue: null,
        newValue: "Bill",
        changedAt: now,
      },
    );

    const rows = buildAuditCenterRows({ auditLog, actions });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.actionTitle, "Escalate DM One territory risk");

    const filtered = filterAuditCenterRows(rows, { owner: "Bill", status: "open" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.owner, "Bill");
  });

  it("buckets overdue actions into escalation tiers", () => {
    assert.equal(overdueEscalationBucket(2), null);
    assert.equal(overdueEscalationBucket(3), "3+");
    assert.equal(overdueEscalationBucket(10), "7+");
    assert.equal(overdueEscalationBucket(15), "14+");
    assert.equal(overdueEscalationBucket(25), "21+");

    const dashboard = buildOverdueEscalationDashboard({
      overdueActions: [
        trackedAction({ dueDate: "2026-06-12T12:00:00.000Z" }),
        trackedAction({
          recommendationId: "action-old",
          dueDate: "2026-05-20T12:00:00.000Z",
        }),
      ],
      referenceMs,
    });

    assert.equal(dashboard.totalOverdue, 2);
    assert.equal(dashboard.buckets["3+"].length, 1);
    assert.equal(dashboard.buckets["21+"].length, 1);
  });

  it("formats executive email markdown for Monday leadership email", () => {
    const packet = buildExecutiveWeeklyPacket({
      forecast: minimalForecast(),
      actions: [trackedAction()],
      overdueActions: [trackedAction()],
      previousHistory: priorHistory(),
      generatedAt: now,
    });

    const markdown = formatExecutiveEmailMarkdown(packet);
    assert.match(markdown, /^# Executive Summary — Week of/);
    assert.match(markdown, /## Open Actions/);
    assert.match(markdown, /## Overdue Actions/);
    assert.match(markdown, /## Completed Actions/);
    assert.match(markdown, /## Forecast Changes/);
    assert.match(markdown, /## Top Risks/);
    assert.match(markdown, /## Recommendations/);
    assert.match(markdown, /\[CRITICAL\]/);
  });

  it("includes operating rhythm on accountability snapshot", () => {
    const forecast = minimalForecast();
    const { snapshot } = buildExecutiveAccountabilitySnapshot({
      forecast,
      workflows: {},
      store: {
        actions: [],
        forecastHistory: [priorHistory()],
        auditLog: [],
        updatedAt: now,
      },
      generatedAt: now,
    });

    assert.ok(snapshot.operatingRhythm);
    assert.ok(snapshot.operatingRhythm.weeklyPacket);
    assert.ok(snapshot.operatingRhythm.auditCenter);
    assert.ok(snapshot.operatingRhythm.overdueEscalation);
    assert.match(snapshot.operatingRhythm.emailMarkdown, /Executive Summary/);
  });
});
