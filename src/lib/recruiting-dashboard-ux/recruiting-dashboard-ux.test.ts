import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import { buildRecruiterOperationalKpis } from "@/lib/recruiting-dashboard-ux/recruiter-operational-kpis";
import {
  buildStaffingHeatRowsFromSnapshot,
  buildStaffingHeatRows,
} from "@/lib/recruiting-dashboard-ux/staffing-heat-table";
import { buildTopRecommendedActions } from "@/lib/recruiting-dashboard-ux/top-recommended-actions";
import {
  buildRecruiterActionCatalog,
  filterActionsByLane,
  groupRecruiterActions,
} from "@/lib/recruiting-dashboard-ux/recruiter-action-catalog";
import { buildOperationalWorkspaceJobs } from "@/lib/recruiting-dashboard-ux/operational-workspace";
import { enrichStaffingHeatRows } from "@/lib/recruiting-dashboard-ux/staffing-heat-table";
import type { BreezyJob } from "@/lib/breezy-api";

function snapshot(): RecruitingIntelligenceSnapshot {
  return {
    territoryLabel: "TX",
    territoryStates: ["TX"],
    fetchedAt: "2026-05-20T12:00:00.000Z",
    jobRankings: [],
    topCandidatesTerritory: [],
    suggestedActions: [],
    smartAlerts: [],
    recruitingAlerts: [],
    recommendations: [
      {
        id: "legacy-1",
        type: "repost-timing",
        recommendation: "Repost Dallas TX",
        reason: "No applicants in 7 days",
        impactEstimate: "+3 applicants",
        urgency: "high",
        jobId: "job-1",
        city: "Dallas",
        state: "TX",
      },
    ],
    candidateIntelligence: {
      profiles: [],
      summaryBullets: [],
      skillTagCounts: [],
      stageCounts: [],
      sourceCounts: [],
      territoryLabel: "TX",
    },
    executiveInsights: {
      totalApplicants: 0,
      totalHires: 0,
      conversionPercent: null,
      topSources: [],
      territoryRiskScore: 0,
    },
    productivity: [],
    trends: {
      applicantsPerDay: [],
      hiresPerWeek: [],
      sourceConversion: [],
      territoryFillVelocity: [],
    },
    dailySnapshot: {
      summaryBullets: [],
      hottestTerritories: [],
      highestRiskTerritories: [],
      bestRecruitingSources: [],
    },
    automationHooks: [],
    decisionIntelligence: {
      fetchedAt: "2026-05-20T12:00:00.000Z",
      coverageRecommendations: [
        {
          jobId: "job-1",
          jobTitle: "Merch",
          city: "Dallas",
          state: "TX",
          nearbyActiveReps25Mi: 3,
          pendingVariantsNearby: 1,
          approvedUnpublishedVariantsNearby: 0,
          publishedVariantsNearby: 0,
          strongerApplicantFlowCities: ["Plano"],
          territorySaturationScore: 2,
          openOpportunityCount: 4,
          staffingRiskScore: 140,
          recommendedExpansionCities: ["Dallas", "Plano", "Arlington"],
          recommendedExpansionRadiusMiles: 25,
          daysWithoutHire: 28,
          jobAgeDays: 34,
          summaryBullets: ["Recommend expanding from Dallas → Plano + Arlington"],
        },
      ],
      suggestedActions: [
        {
          id: "repost-variant-1",
          type: "repost",
          title: "Repost recommendation (variant #3)",
          reason: "Best-performing nearby variant",
          impactEstimate: "Manual repost only",
          urgency: "high",
          manualOnly: true,
          jobId: "job-1",
          city: "Dallas",
          state: "TX",
        },
      ],
      variantPerformance: [],
      territory: {
        territoryLabel: "TX",
        territoryStates: ["TX"],
        staffingPressureScore: 62,
        strongestMarkets: [],
        weakestMarkets: [],
        fastestGrowingMarkets: [],
        highestEscalationZones: [],
        bestConversionTerritory: "TX",
        highestRiskTerritory: "TX",
        topRiskCities: [
          {
            label: "Dallas, TX",
            city: "Dallas",
            state: "TX",
            score: 80,
            openJobs: 3,
            applicants7d: 0,
            escalationCount: 2,
          },
        ],
        topOpportunityCities: [],
      },
      recommendedNextActions: [
        {
          id: "repost-variant-1",
          type: "repost",
          title: "Repost recommendation (variant #3)",
          reason: "Best-performing nearby variant",
          impactEstimate: "Manual repost only",
          urgency: "high",
          manualOnly: true,
          jobId: "job-1",
          city: "Dallas",
          state: "TX",
        },
      ],
    },
  };
}

describe("recruiting dashboard ux", () => {
  it("prioritizes decision recommendations over legacy duplicates", () => {
    const top = buildTopRecommendedActions(snapshot(), 5);
    assert.ok(top.some((row) => row.title.includes("variant #3")));
    assert.equal(top.every((row) => row.manualOnly === true), true);
  });

  it("builds operational KPI cards", () => {
    const kpis = buildRecruiterOperationalKpis(snapshot(), [], [], [
      {
        id: "e1",
        escalationType: "request-repost",
        dmName: "Amy",
        dmUserId: "dm-1",
        territory: "TX",
        territoryStates: ["TX"],
        state: "TX",
        city: "Dallas",
        relatedJobId: "job-1",
        jobTitle: "Merch",
        priority: "high",
        priorityScore: 100,
        recommendedAction: "Review",
        alertReason: "Low flow",
        jobAgeDays: 10,
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        status: "in_review",
        internalNotes: [],
        activity: [],
      },
    ]);
    assert.ok(kpis.some((row) => row.id === "aging-jobs"));
    assert.ok(kpis.some((row) => row.id === "escalation-response"));
  });

  it("builds staffing heat rows from snapshot fallback", () => {
    const rows = buildStaffingHeatRowsFromSnapshot(snapshot());
    assert.ok(rows.some((row) => row.level === "critical" || row.level === "moderate"));
  });

  it("splits unified action catalog into immediate and strategic lanes", () => {
    const catalog = buildRecruiterActionCatalog(snapshot());
    const immediate = filterActionsByLane(catalog, "immediate");
    const strategic = filterActionsByLane(catalog, "strategic");
    assert.ok(immediate.some((row) => row.actionType === "repost" || row.actionType === "legacy-repost"));
    assert.ok(strategic.some((row) => row.actionType === "expand-radius" || row.actionType === "increase-pay"));
    const groups = groupRecruiterActions(catalog);
    assert.ok(groups.length > 0);
    assert.equal(catalog.every((row) => row.manualOnly === true), true);
  });

  it("builds operational workspace rows from coverage snapshot", () => {
    const catalog = buildRecruiterActionCatalog(snapshot());
    const jobs = buildOperationalWorkspaceJobs(snapshot(), [], catalog);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.jobId, "job-1");
    assert.ok(jobs[0]!.territoryRiskScore >= 90);
    assert.ok(jobs[0]!.recommendedAction.length > 0);
  });

  it("enriches heat rows with rank and trend metadata", () => {
    const rows = enrichStaffingHeatRows(
      [
        {
          id: "city:1",
          level: "critical",
          label: "Dallas, TX",
          scope: "city",
          openJobs: 3,
          zeroApplicantJobs: 2,
          activeReps: 0,
          escalationCount: 2,
          applicants7d: 0,
          healthScore: 80,
          demandScore: 10,
        },
      ],
      62,
    );
    assert.equal(rows[0]?.rank, 1);
    assert.equal(rows[0]?.trend, "declining");
    assert.equal(rows[0]?.isHighestRisk, true);
  });

  it("builds city heat rows from breezy jobs", () => {
    const jobs: BreezyJob[] = [
      {
        jobId: "job-1",
        name: "Merch",
        city: "Dallas",
        state: "TX",
        zip: "",
        displayLocation: "Dallas, TX",
        locationSource: "location",
        status: "published",
        createdDate: "2026-04-01T00:00:00.000Z",
        updatedDate: "2026-05-01T00:00:00.000Z",
      },
    ];
    const rows = buildStaffingHeatRows({
      jobs,
      candidates: [],
      escalations: [],
      snapshot: snapshot(),
      activeRepsByState: new Map([["TX", 4]]),
    });
    assert.ok(rows.length > 0);
  });
});
