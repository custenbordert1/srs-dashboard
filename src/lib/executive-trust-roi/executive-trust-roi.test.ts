import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import {
  assignRecordTrustFlag,
  assignTrustFlag,
  buildActionPerformanceRows,
  buildActualVsExpectedRows,
  buildCeoRoiSummary,
  buildExecutiveImpactSummary,
  buildExecutiveTrustRoiSnapshot,
  computeRoiCategory,
  enrichAutomationWithRoi,
  outcomeDeltaForRecord,
} from "@/lib/executive-trust-roi";
import { adjustConfidenceScore } from "@/lib/recommendation-intelligence/confidence-adjustment";
import { buildRecommendationIntelligenceSnapshot } from "@/lib/recommendation-intelligence/build-snapshot";
import { buildRecommendationRecord } from "@/lib/recommendation-intelligence/store";
import type { OutcomeMetrics, RecommendationRecord } from "@/lib/recommendation-intelligence/types";
import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;

function metrics(overrides: Partial<OutcomeMetrics> = {}): OutcomeMetrics {
  return {
    applicants: 10,
    interviews: 3,
    offers: 1,
    newHires: 1,
    coveragePercent: 50,
    openCalls: 4,
    riskScore: 60,
    projectCompletionPercent: 45,
    ...overrides,
  };
}

function sampleRecord(overrides: Partial<RecommendationRecord> = {}): RecommendationRecord {
  const base = buildRecommendationRecord({
    recommendationId: "autopilot:territory:dm-1",
    recommendationType: "refresh-job-posting",
    source: "autopilot",
    createdDate: "2026-05-15T12:00:00.000Z",
    owner: SAMPLE_DM,
    territory: "TX",
    dmName: SAMPLE_DM,
    expectedOutcome: "+5 applicants",
    expectedImpactScore: 70,
    expectedApplicantGain: 5,
    scope: {
      territory: "TX",
      recruiter: null,
      project: null,
      dmName: SAMPLE_DM,
      entityId: `dm:${SAMPLE_DM}`,
      entityType: "territory",
    },
    baselineMetrics: metrics({ applicants: 2 }),
  });
  return { ...base, ...overrides };
}

function sampleAutomation(overrides: Partial<RecruitingAutomationRecord> = {}): RecruitingAutomationRecord {
  return {
    id: "auto-1",
    actionType: "job-refresh",
    owner: SAMPLE_DM,
    reason: "Refresh stale posting",
    expectedImpact: "+8 applicants · +4% coverage",
    sourceRecommendation: {
      recommendationId: "autopilot:territory:dm-1",
      recommendationType: "refresh-job-posting",
      source: "autopilot",
      label: "Refresh Job Posting",
    },
    approvalStatus: "Draft",
    executionStatus: "Draft",
    payload: {
      title: "Retail Merchandiser",
      location: "Austin, TX",
      project: null,
      reason: "Stale",
      expectedApplicantGain: 8,
      priority: "high",
      timing: "today",
    },
    territory: "TX",
    dmName: SAMPLE_DM,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    executedBy: null,
    executedAt: null,
    failureReason: null,
    cancelledAt: null,
    auditLog: [],
    ...overrides,
  };
}

function minimalBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [
      {
        jobId: "job-1",
        name: "Retail Merchandiser",
        city: "Austin",
        state: "TX",
        zip: "78701",
        displayLocation: "Austin, TX",
        locationSource: "location",
        status: "published",
        createdDate: "2026-05-01T00:00:00.000Z",
        updatedDate: "2026-06-01T00:00:00.000Z",
        candidateCount: 8,
      },
    ],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates: [
      {
        candidateId: "cand-1",
        firstName: "Alex",
        lastName: "Rivera",
        email: "alex@example.com",
        phone: "",
        positionId: "job-1",
        positionName: "Retail Merchandiser",
        stage: "applied",
        source: "Indeed",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        appliedDate: "2026-06-10T00:00:00.000Z",
        createdDate: "2026-06-10T00:00:00.000Z",
        addedDate: "2026-06-10T00:00:00.000Z",
        updatedDate: "2026-06-10T00:00:00.000Z",
        addedDateSource: "creation_date",
        resumeText: "",
        hasResume: false,
      },
    ],
    workflows: {},
    opportunities: [],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: ["TX"],
      opportunities: [
        {
          opportunityId: "opp-1",
          projectName: "Houston Retail",
          client: "Acme",
          storeName: "Store 101",
          city: "Houston",
          state: "TX",
          territoryOwner: SAMPLE_DM,
          priority: "high",
          nearby: {
            within10: 1,
            within25: 2,
            within50: 3,
            activeWithin50: 2,
            inactiveWithin50: 1,
          },
          activeRepDensity: 2,
          skillMatchScore: 70,
          recentLoginScore: 60,
          territoryAlignmentScore: 80,
          pipelineScore: 40,
          coverageScore: 42,
          staffingRisk: "RED",
          recommendedAction: "assign-recruiter",
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

describe("executive trust & ROI outcome comparison", () => {
  it("computes outcome delta from baseline and latest checkpoint", () => {
    const record = {
      ...sampleRecord(),
      outcomeCheckpoints: {
        day0: metrics({ applicants: 2 }),
        day7: null,
        day14: null,
        day30: metrics({ applicants: 12, newHires: 2 }),
      },
    };
    const delta = outcomeDeltaForRecord(record);
    assert.equal(delta?.applicants, 10);
    assert.equal(delta?.newHires, 1);
  });

  it("builds actual vs expected rows with ROI and trust", () => {
    const records = [
      {
        ...sampleRecord(),
        status: "Completed" as const,
        effectiveness: "Highly Effective" as const,
        outcomeCheckpoints: {
          day0: metrics({ applicants: 2 }),
          day7: null,
          day14: null,
          day30: metrics({ applicants: 12 }),
        },
      },
    ];
    const rows = buildActualVsExpectedRows(records);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.actualApplicantGain, 10);
    assert.equal(rows[0]!.roiCategory, "High ROI");
    assert.ok(rows[0]!.trustFlag);
  });
});

describe("executive trust & ROI scoring", () => {
  it("classifies high ROI for highly effective outcomes", () => {
    const category = computeRoiCategory({
      ...sampleRecord(),
      status: "Completed",
      effectiveness: "Highly Effective",
      outcomeCheckpoints: {
        day0: metrics({ applicants: 2 }),
        day7: null,
        day14: null,
        day30: metrics({ applicants: 12 }),
      },
    });
    assert.equal(category, "High ROI");
  });

  it("classifies negative ROI for ineffective outcomes", () => {
    const category = computeRoiCategory({
      ...sampleRecord(),
      status: "Completed",
      effectiveness: "Negative Impact",
      outcomeCheckpoints: {
        day0: metrics({ applicants: 10 }),
        day7: null,
        day14: null,
        day30: metrics({ applicants: 5 }),
      },
    });
    assert.equal(category, "Negative ROI");
  });
});

describe("executive trust & ROI confidence adjustment", () => {
  it("raises confidence when learned success rate exceeds baseline", () => {
    const adjusted = adjustConfidenceScore(65, "refresh-job-posting", {
      "refresh-job-posting": 80,
    });
    assert.ok(adjusted > 65);
  });

  it("lowers confidence when learned success rate is weak", () => {
    const adjusted = adjustConfidenceScore(65, "adjust-pay-rate", {
      "adjust-pay-rate": 20,
    });
    assert.ok(adjusted < 65);
  });
});

describe("executive trust & ROI trust flags", () => {
  it("marks unproven types with limited tracking", () => {
    const flag = assignTrustFlag({ records: [sampleRecord()] });
    assert.equal(flag, "Unproven");
  });

  it("marks proven types with strong historical success", () => {
    const records = Array.from({ length: 6 }, (_, index) => ({
      ...sampleRecord({ recommendationId: `rec-${index}` }),
      status: "Completed" as const,
      effectiveness: (index < 5 ? "Highly Effective" : "Effective") as const,
    }));
    const flag = assignTrustFlag({ records, roiCategory: "High ROI" });
    assert.equal(flag, "Proven");
  });

  it("assigns poor performer for negative ROI records", () => {
    const typeRecords = [sampleRecord()];
    const flag = assignRecordTrustFlag(
      {
        ...sampleRecord(),
        status: "Completed",
        effectiveness: "Negative Impact",
        outcomeCheckpoints: {
          day0: metrics({ applicants: 10 }),
          day7: null,
          day14: null,
          day30: metrics({ applicants: 4 }),
        },
      },
      typeRecords,
    );
    assert.equal(flag, "Poor performer");
  });
});

describe("executive trust & ROI CEO summary", () => {
  it("builds CEO ROI summary from recommendation records", () => {
    const records: RecommendationRecord[] = [
      {
        ...sampleRecord({ recommendationType: "refresh-job-posting" }),
        status: "Completed",
        effectiveness: "Highly Effective",
        source: "daily-action",
        outcomeCheckpoints: {
          day0: metrics({ applicants: 2, newHires: 0 }),
          day7: null,
          day14: null,
          day30: metrics({ applicants: 10, newHires: 1, coveragePercent: 55 }),
        },
      },
      {
        ...sampleRecord({
          recommendationId: "autopilot:2",
          recommendationType: "adjust-pay-rate",
        }),
        status: "Completed",
        effectiveness: "Ineffective",
      },
    ];
    const impact = buildExecutiveImpactSummary(records);
    const summary = buildCeoRoiSummary(records, impact);
    assert.ok(summary.bestActionWorking);
    assert.ok(summary.worstAction);
    assert.ok(summary.estimatedHiresInfluenced >= 0);
    assert.ok(summary.automationRoi.summary.length > 0);
  });

  it("aggregates action performance by recommendation type", () => {
    const records = [
      {
        ...sampleRecord(),
        status: "Completed" as const,
        effectiveness: "Highly Effective" as const,
        outcomeCheckpoints: {
          day0: metrics({ applicants: 2 }),
          day7: null,
          day14: null,
          day30: metrics({ applicants: 10 }),
        },
      },
      {
        ...sampleRecord({ recommendationId: "autopilot:2" }),
        status: "Completed" as const,
        effectiveness: "Effective" as const,
      },
    ];
    const rows = buildActionPerformanceRows(records);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.successRate, 100);
  });
});

describe("executive trust & ROI automation enrichment", () => {
  it("enriches automation drafts with projected and historical ROI", () => {
    const records = [
      {
        ...sampleRecord(),
        status: "Completed" as const,
        effectiveness: "Highly Effective" as const,
        outcomeCheckpoints: {
          day0: metrics({ applicants: 2 }),
          day7: null,
          day14: null,
          day30: metrics({ applicants: 12 }),
        },
      },
    ];
    const byId = enrichAutomationWithRoi({
      automations: [sampleAutomation()],
      records,
    });
    const view = byId["auto-1"];
    assert.ok(view);
    assert.equal(view.projectedApplicantGain, 8);
    assert.ok(view.confidenceScore > 0);
    assert.ok(view.trustFlag);
  });

  it("includes actual results for completed automations", () => {
    const records = [
      {
        ...sampleRecord(),
        status: "Completed" as const,
        effectiveness: "Effective" as const,
        outcomeCheckpoints: {
          day0: metrics({ applicants: 2 }),
          day7: null,
          day14: null,
          day30: metrics({ applicants: 9 }),
        },
      },
    ];
    const byId = enrichAutomationWithRoi({
      automations: [sampleAutomation({ approvalStatus: "Completed" })],
      records,
    });
    assert.ok(byId["auto-1"]?.actualResult);
    assert.ok(byId["auto-1"]?.recommendationAccuracy);
  });
});

describe("executive trust & ROI recommendation intelligence aggregation", () => {
  it("includes trust ROI in recommendation intelligence snapshot", async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "srs-trust-roi-"));
    process.chdir(tempDir);
    try {
      const snapshot = await buildRecommendationIntelligenceSnapshot({
        bundle: minimalBundle(),
        persist: true,
      });
      assert.ok(snapshot.trustRoi);
      assert.ok(snapshot.trustRoi.executiveImpact);
      assert.ok(Array.isArray(snapshot.trustRoi.topPerformingActions));
      assert.ok(snapshot.trustRoi.ceoRoiSummary);
      assert.ok(typeof snapshot.trustRoi.trustByType === "object");

      const trustSnapshot = buildExecutiveTrustRoiSnapshot({
        records: snapshot.recentRecords,
        generatedAt: snapshot.generatedAt,
      });
      assert.equal(trustSnapshot.generatedAt, snapshot.generatedAt);
    } finally {
      process.chdir(previousCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
