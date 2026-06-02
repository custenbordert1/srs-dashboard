import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDmPortalOperationalView,
  countReadyForMel,
  resolveCoverageHealthTier,
  resolveDmPortalAlertHref,
  topNeedsAttentionAlerts,
} from "@/lib/dm-portal/dm-portal-operational";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";

function minimalSnapshot(overrides: Partial<DmDashboardSnapshot> = {}): DmDashboardSnapshot {
  return {
    dmName: "Amy Harp",
    territoryStates: ["TX", "OK"],
    territoryLabel: "TX, OK",
    fetchedAt: new Date().toISOString(),
    health: { score: 85, label: "Healthy", factors: [] },
    kpis: [],
    activeJobs: 3,
    candidatesLast7Days: 5,
    interviewing: 1,
    agingJobs: 0,
    topHiringCities: [],
    candidateSources: [],
    fillRiskAlerts: [],
    needsAttention: [],
    highestFillRisk: [],
    prioritizedAlerts: Array.from({ length: 12 }, (_, index) => ({
      id: `alert-${index}`,
      severity: "warning",
      category: "no-applicants-7d",
      title: `Alert ${index}`,
      detail: "detail",
      priority: index < 2 ? "critical" : "high",
      priorityScore: 100 - index,
      recommendedAction: "Review",
      ageDays: index,
      alertTypeLabel: "No recent applicants",
      jobId: index === 0 ? "job-1" : undefined,
      state: index === 1 ? "TX" : undefined,
    })) as DmPrioritizedAlert[],
    alertSummary: {
      criticalCount: 2,
      highCount: 3,
      mediumCount: 1,
      lowCount: 0,
      agingJobsCount: 0,
      zeroApplicantJobsCount: 0,
      territoryRecruitingRiskScore: 0,
    },
    operationalIndex: { jobsById: {}, citiesByKey: {}, statesByCode: {}, alertsById: {} },
    topCandidates: [],
    recentApplicants: [],
    coverage: {
      candidateShortagesByState: [{ label: "TX", value: 2 }],
      topProblemCities: [],
      hardestToFillTerritories: [],
      hiringVelocityTrends: [],
    },
    pipeline: {
      counts: { applied: 2, interviewing: 1, hired: 4, stalled: 0 },
      applied: [],
      interviewing: [],
      hired: [],
      stalled: [],
    },
    heatmap: {
      version: 1,
      fetchedAt: new Date().toISOString(),
      territoryLabel: "TX, OK",
      cells: [],
      meta: { cellCount: 0, avgHealthScore: 0, maxOpportunityDensity: 0 },
    },
    melMatching: {
      unstaffedHighPriorityStores: [{ projectName: "P1", client: "C", storeName: "S", state: "TX", territoryOwner: "Amy" }],
      bestCandidateForOpenProjects: [{ projectName: "P1", client: "C", candidateName: "Jane", candidateId: "c1", fitPercent: 80, distanceMiles: 10 }],
      candidatesNearAgingOpportunities: [],
    },
    onboarding: {
      paperworkSent: 3,
      paperworkSigned: 2,
      ddNotRequested: 0,
      ddRequested: 0,
      ddReceived: 0,
      ddApproved: 1,
      awaitingDdVerification: 0,
    },
    ...overrides,
  };
}

describe("dm-portal-operational", () => {
  it("classifies coverage health tiers", () => {
    assert.equal(resolveCoverageHealthTier(80), "green");
    assert.equal(resolveCoverageHealthTier(79), "yellow");
    assert.equal(resolveCoverageHealthTier(50), "yellow");
    assert.equal(resolveCoverageHealthTier(49), "red");
  });

  it("builds territory and pipeline summaries", () => {
    const view = buildDmPortalOperationalView(minimalSnapshot());
    assert.equal(view.territory.stateCount, 2);
    assert.equal(view.territory.openJobs, 3);
    assert.equal(view.territory.coverageTier, "green");
    assert.equal(view.pipeline.applicantsLast7Days, 5);
    assert.equal(view.pipeline.paperworkSent, 3);
    assert.equal(view.pipeline.hired, 4);
  });

  it("limits needs attention to top 10", () => {
    const alerts = topNeedsAttentionAlerts(minimalSnapshot());
    assert.equal(alerts.length, 10);
    assert.equal(alerts[0]?.jobId, "job-1");
  });

  it("builds alert deep links on /dm", () => {
    const alerts = topNeedsAttentionAlerts(minimalSnapshot());
    assert.match(resolveDmPortalAlertHref(alerts[0]!), /jobId=job-1/);
    assert.match(resolveDmPortalAlertHref(alerts[1]!), /state=TX/);
  });

  it("counts ready for MEL from onboarding and MEL matches", () => {
    assert.equal(countReadyForMel(minimalSnapshot()), 2);
  });
});
