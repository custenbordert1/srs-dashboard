import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import {
  adjustConfidenceScore,
  applyLearnedConfidenceToRecommendations,
  buildLearnedSuccessRates,
  buildRecommendationIntelligenceSnapshot,
  buildRecommendationLeaderboardSnapshot,
  buildRecommendationRecord,
  buildRoiLeaderboard,
  buildTypePerformance,
  computeRoiScore,
  executeRecommendationRecord,
  listRecommendationRecords,
  processRecommendationOutcomes,
  scoreEffectiveness,
  scoreExpiredRecommendation,
  syncRecommendationRecords,
  summarizeActualGain,
} from "@/lib/recommendation-intelligence";
import type { OutcomeMetrics, RecommendationRecord } from "@/lib/recommendation-intelligence/types";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;

function sampleRecommendation(overrides: Partial<AutopilotRecommendation> = {}): AutopilotRecommendation {
  return {
    id: "autopilot:territory:dm-1",
    kind: "refresh-job-posting",
    title: "Refresh Job Posting",
    entityType: "territory",
    entityId: `dm:${SAMPLE_DM}`,
    entityLabel: SAMPLE_DM,
    dmName: SAMPLE_DM,
    impactScore: 70,
    confidenceScore: 65,
    estimatedOutcomeImprovement: 72,
    reasoning: "Stale posting with low applicant velocity.",
    supportingMetrics: [],
    opportunity: {
      currentRisk: 78,
      potentialImprovement: 20,
      estimatedCandidateGain: 5,
      estimatedCoverageGain: 8,
      estimatedCompletionGain: 5,
      expectedRoiScore: 68,
    },
    prioritizationScore: 75,
    horizon: "quick-win",
    navigation: {
      tabId: "autopilot-recommendations",
      label: "Open Autopilot",
    },
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
      {
        candidateId: "cand-2",
        firstName: "Sam",
        lastName: "Lee",
        email: "sam@example.com",
        phone: "",
        positionId: "job-1",
        positionName: "Retail Merchandiser",
        stage: "interview",
        source: "Referral",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        appliedDate: "2026-06-08T00:00:00.000Z",
        createdDate: "2026-06-08T00:00:00.000Z",
        addedDate: "2026-06-08T00:00:00.000Z",
        updatedDate: "2026-06-08T00:00:00.000Z",
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

describe("recommendation intelligence scoring", () => {
  it("scores highly effective when actual gain exceeds expected", () => {
    const rating = scoreEffectiveness({
      expectedApplicantGain: 5,
      baseline: metrics({ applicants: 2 }),
      current: metrics({ applicants: 10 }),
    });
    assert.equal(rating, "Highly Effective");
  });

  it("scores ineffective when expected gain is not met", () => {
    const rating = scoreEffectiveness({
      expectedApplicantGain: 3,
      baseline: metrics({ applicants: 5 }),
      current: metrics({ applicants: 5 }),
    });
    assert.equal(rating, "Ineffective");
  });

  it("adjusts confidence upward for high success rates", () => {
    const adjusted = adjustConfidenceScore(65, "refresh-job-posting", {
      "refresh-job-posting": 82,
    });
    assert.ok(adjusted > 65);
  });

  it("adjusts confidence downward for poor success rates", () => {
    const adjusted = adjustConfidenceScore(65, "adjust-pay-rate", {
      "adjust-pay-rate": 20,
    });
    assert.ok(adjusted < 65);
  });
});

describe("recommendation intelligence execution tracking", () => {
  it("syncs autopilot recommendations into trackable records", () => {
    const bundle = minimalBundle();
    const synced = syncRecommendationRecords({
      bundle,
      autopilotRecommendations: [sampleRecommendation()],
      existing: [],
    });
    assert.equal(synced.length, 1);
    assert.equal(synced[0]?.recommendationType, "refresh-job-posting");
    assert.equal(synced[0]?.status, "Ignored");
    assert.ok(synced[0]?.baselineMetrics);
  });

  it("persists execution with owner and baseline metrics", async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "srs-rec-intel-"));
    process.chdir(tempDir);
    try {
      const session = {
        userId: "exec-1",
        role: "executive" as const,
        email: "exec@example.com",
        name: "Exec User",
        territoryStates: null,
      };
      await executeRecommendationRecord(session, {
        recommendationId: "autopilot:territory:dm-1",
        owner: SAMPLE_DM,
        ownerKind: "dm",
        baselineMetrics: metrics({ applicants: 2 }),
      });
      const rows = await listRecommendationRecords();
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, "In Progress");
      assert.equal(rows[0]?.owner, SAMPLE_DM);
      assert.ok(rows[0]?.executionDate);
      assert.equal(rows[0]?.outcomeCheckpoints.day0?.applicants, 2);
    } finally {
      process.chdir(previousCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("recommendation intelligence outcome scoring", () => {
  it("auto-scores expired recommendations", () => {
    const bundle = minimalBundle();
    const expired = scoreExpiredRecommendation({
      record: {
        ...sampleRecord({
          status: "In Progress",
          executionDate: "2026-05-01T12:00:00.000Z",
          expiresAt: "2026-05-31T12:00:00.000Z",
          expectedApplicantGain: 5,
        }),
        outcomeCheckpoints: {
          day0: metrics({ applicants: 2 }),
          day7: null,
          day14: null,
          day30: null,
        },
      },
      bundle,
      referenceMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });
    assert.equal(expired.status, "Completed");
    assert.ok(expired.effectiveness);
    assert.ok(expired.effectivenessScoredAt);
  });

  it("summarizes actual applicant gain from checkpoints", () => {
    const gain = summarizeActualGain({
      ...sampleRecord(),
      baselineMetrics: metrics({ applicants: 2 }),
      outcomeCheckpoints: {
        day0: metrics({ applicants: 2 }),
        day7: metrics({ applicants: 6 }),
        day14: null,
        day30: null,
      },
    });
    assert.equal(gain, 4);
  });
});

describe("recommendation intelligence ranking", () => {
  it("ranks recommendation types by success rate", () => {
    const records: RecommendationRecord[] = [
      {
        ...sampleRecord({ recommendationType: "refresh-job-posting" }),
        effectiveness: "Highly Effective",
        effectivenessScoredAt: "2026-06-01T00:00:00.000Z",
      },
      {
        ...sampleRecord({
          recommendationId: "autopilot:2",
          recommendationType: "reopen-previous-candidates",
        }),
        effectiveness: "Effective",
        effectivenessScoredAt: "2026-06-01T00:00:00.000Z",
      },
      {
        ...sampleRecord({
          recommendationId: "autopilot:3",
          recommendationType: "adjust-pay-rate",
        }),
        effectiveness: "Ineffective",
        effectivenessScoredAt: "2026-06-01T00:00:00.000Z",
      },
    ];
    const performance = buildTypePerformance(records);
    const refresh = performance.find((row) => row.recommendationType === "refresh-job-posting");
    assert.equal(refresh?.successRate, 100);
    const rates = buildLearnedSuccessRates(records);
    assert.equal(rates["refresh-job-posting"], 100);
  });

  it("builds ROI leaderboard entries", () => {
    const records: RecommendationRecord[] = [
      {
        ...sampleRecord(),
        status: "Completed",
        effectiveness: "Highly Effective",
        baselineMetrics: metrics({ applicants: 2 }),
        outcomeCheckpoints: {
          day0: metrics({ applicants: 2 }),
          day7: null,
          day14: null,
          day30: metrics({ applicants: 12 }),
        },
      },
    ];
    const leaderboard = buildRoiLeaderboard(records);
    assert.equal(leaderboard.length, 1);
    assert.ok(leaderboard[0]!.roiScore > 0);
    assert.equal(leaderboard[0]!.actualApplicantGain, 10);
  });

  it("applies learned confidence to autopilot recommendations", () => {
    const adjusted = applyLearnedConfidenceToRecommendations([sampleRecommendation()], {
      "refresh-job-posting": 80,
    });
    assert.ok(adjusted[0]!.confidenceScore >= 65);
  });
});

describe("recommendation intelligence dashboard aggregation", () => {
  it("builds executive snapshot with leaderboard and trends", async () => {
    const previousCwd = process.cwd();
    const tempDir = await mkdtemp(path.join(tmpdir(), "srs-rec-intel-snap-"));
    process.chdir(tempDir);
    try {
      const bundle = minimalBundle();
      const snapshot = await buildRecommendationIntelligenceSnapshot({
        bundle,
        persist: true,
      });
      assert.ok(snapshot.executiveSummary.totalTracked >= 1);
      assert.ok(Array.isArray(snapshot.roiLeaderboard));
      assert.ok(Array.isArray(snapshot.topPerformingTypes));

      const allRecords = await listRecommendationRecords();
      const leaderboard = buildRecommendationLeaderboardSnapshot({
        generatedAt: bundle.fetchedAt,
        records: allRecords,
      });
      assert.ok(leaderboard.roiLeaderboard.length >= 0);
    } finally {
      process.chdir(previousCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("computes ROI score from expected and actual gains", () => {
    const roi = computeRoiScore({
      expectedApplicantGain: 5,
      actualApplicantGain: 8,
      effectiveness: "Highly Effective",
    });
    assert.ok(roi > 50);
  });

  it("processes in-progress outcome checkpoints", () => {
    const bundle = minimalBundle();
    const processed = processRecommendationOutcomes({
      records: [
        sampleRecord({
          status: "In Progress",
          executionDate: "2026-06-14T12:00:00.000Z",
          createdDate: "2026-06-14T12:00:00.000Z",
          expiresAt: "2026-07-14T12:00:00.000Z",
        }),
      ],
      bundle,
      referenceMs: Date.parse("2026-06-15T12:00:00.000Z"),
    });
    assert.ok(processed[0]?.outcomeCheckpoints.day0);
  });
});
