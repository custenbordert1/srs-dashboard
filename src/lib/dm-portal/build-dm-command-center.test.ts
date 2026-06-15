import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import { buildDmCommandCenterSnapshot } from "@/lib/dm-portal/build-dm-command-center";

function minimalSnapshot(overrides: Partial<DmDashboardSnapshot> = {}): DmDashboardSnapshot {
  return {
    dmName: "Amy Harp",
    territoryStates: ["TX", "OK"],
    territoryLabel: "TX, OK",
    fetchedAt: new Date().toISOString(),
    health: { score: 15, label: "Critical", factors: [] },
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
    prioritizedAlerts: [
      {
        id: "alert-1",
        severity: "warning",
        category: "job-aging-14",
        title: "No applicants 14+ days",
        detail: "Dallas merchandiser",
        priority: "high",
        priorityScore: 280,
        recommendedAction: "Request recruiter support",
        ageDays: 16,
        alertTypeLabel: "Job aging (14d+)",
        jobId: "job-1",
      },
    ] as DmPrioritizedAlert[],
    alertSummary: {
      criticalCount: 1,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      agingJobsCount: 1,
      zeroApplicantJobsCount: 1,
      territoryRecruitingRiskScore: 80,
    },
    operationalIndex: {
      jobsById: {
        "job-1": {
          jobId: "job-1",
          title: "Merchandiser",
          city: "Dallas",
          state: "TX",
          cityKey: "Dallas, TX",
          jobAgeDays: 16,
          applicantCount: 0,
          interviewingCount: 0,
          lastApplicantAt: null,
          daysSinceLastApplicant: 16,
          payRange: null,
          assignedRecruiter: null,
          priority: "high",
          priorityScore: 280,
          recommendedAction: "Repost",
          relatedAlertIds: ["alert-1"],
          candidateCounts: { applied: 0, interviewing: 0, hired: 0, stalled: 0 },
        },
      },
      citiesByKey: {},
      statesByCode: { TX: { state: "TX", openJobs: 2, alertCount: 1, demandLevel: "High", jobIds: ["job-1"] } },
      alertsById: {},
    },
    topCandidates: [],
    recentApplicants: [],
    coverage: {
      candidateShortagesByState: [{ label: "TX", value: 2 }],
      topProblemCities: [{ label: "Dallas, TX", value: 8 }],
      hardestToFillTerritories: [],
      hiringVelocityTrends: [],
    },
    pipeline: {
      counts: { applied: 2, interviewing: 1, hired: 0, stalled: 1 },
      applied: [],
      interviewing: [],
      hired: [],
      stalled: [],
    },
    heatmap: {
      version: 1,
      fetchedAt: new Date().toISOString(),
      territoryLabel: "TX, OK",
      cells: [
        {
          state: "TX",
          city: "Dallas",
          lat: null,
          lng: null,
          jobCount: 2,
          candidateCount: 1,
          healthScore: 20,
          opportunityDensity: 2,
          riskScore: 70,
        },
      ],
      meta: { cellCount: 1, avgHealthScore: 20, maxOpportunityDensity: 2 },
    },
    melMatching: {
      unstaffedHighPriorityStores: [
        {
          projectName: "Reset Wave",
          client: "Walmart",
          storeName: "Store 120",
          state: "TX",
          territoryOwner: "Amy Harp",
        },
      ],
      bestCandidateForOpenProjects: [],
      candidatesNearAgingOpportunities: [],
    },
    onboarding: {
      paperworkSent: 1,
      paperworkSigned: 0,
      ddNotRequested: 0,
      ddRequested: 0,
      ddReceived: 0,
      ddApproved: 0,
      awaitingDdVerification: 0,
    },
    ...overrides,
  };
}

describe("build-dm-command-center", () => {
  it("builds DM home KPIs for the selected territory", () => {
    const center = buildDmCommandCenterSnapshot(minimalSnapshot());
    assert.equal(center.kpis.length, 5);
    assert.equal(center.kpis[0]?.label, "Coverage %");
    assert.match(center.kpis[0]?.value ?? "", /15%/);
    assert.equal(center.kpis[1]?.label, "Open calls");
    assert.equal(center.kpis[3]?.label, "Projects active");
    assert.equal(center.kpis[4]?.label, "Territory health score");
  });

  it("sorts priority queue by impact score and includes synthetic coverage risk", () => {
    const center = buildDmCommandCenterSnapshot(minimalSnapshot());
    assert.ok(center.priorityQueue.length > 0);
    assert.ok(center.priorityQueue.some((item) => item.id === "synthetic-coverage-low"));
    for (let index = 1; index < center.priorityQueue.length; index += 1) {
      assert.ok(center.priorityQueue[index - 1]!.impactScore >= center.priorityQueue[index]!.impactScore);
    }
  });

  it("prepares territory map rows and project staffing scan rows", () => {
    const center = buildDmCommandCenterSnapshot(minimalSnapshot());
    assert.equal(center.territoryMap.placeholder, true);
    assert.ok(center.territoryMap.states.some((row) => row.state === "TX"));
    assert.ok(center.projectStaffing.some((row) => row.projectName === "Reset Wave"));
    assert.equal(center.repUtilization.length, 4);
    assert.ok(center.escalationCenter.length > 0);
  });
});
