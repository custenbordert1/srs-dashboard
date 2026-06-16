import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import {
  buildEmailDigestDraft,
  buildExecutiveMorningBriefSnapshot,
  buildExecutiveNarratives,
  buildExecutiveScorecard,
  buildMorningBriefExportCsv,
  buildMorningBriefPrintHtml,
  buildMorningBriefPriorities,
  buildCeoHomeSnapshot,
} from "@/lib/executive-morning-brief";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;

function minimalBundle(): RecruitingIntelligenceRouteBundle {
  const fetchedAt = "2026-06-15T12:00:00.000Z";
  return {
    jobs: [
      {
        jobId: "job-1",
        name: "Retail Merchandiser",
        city: "Jacksonville",
        state: "FL",
        zip: "32202",
        displayLocation: "Jacksonville, FL",
        locationSource: "location",
        status: "published",
        createdDate: "2026-05-01T00:00:00.000Z",
        updatedDate: "2026-06-01T00:00:00.000Z",
        candidateCount: 2,
      },
    ],
    jobsResult: {
      ok: true,
      jobs: [],
      fetchedAt,
      companyId: "co",
      state: "published",
    },
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
        city: "Jacksonville",
        state: "FL",
        zipCode: "32202",
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
      dmAlerts: {
        highRiskProjects: [],
        noNearbyReps: [],
        recruitingUrgency: [],
        bestAvailableReps: [],
      },
    },
    fetchedAt,
    candidatesResult: {
      ok: true,
      candidates: [],
      fetchedAt,
      companyId: "co",
    },
    melOk: true,
    intelligenceCache: {
      cacheStatus: "hit",
      snapshotAgeMs: 1000,
      isStale: false,
      backgroundRefresh: false,
      lastRefreshAt: fetchedAt,
      recordCounts: { jobCount: 1, candidateCount: 1, opportunityCount: 0, workflowCount: 0 },
    },
  };
}

describe("executive morning brief", () => {
  it("builds executive scorecard metrics with trends", () => {
    const scorecard = buildExecutiveScorecard(minimalBundle());
    assert.ok(scorecard.length >= 8);
    assert.ok(scorecard.some((row) => row.key === "open-calls"));
    assert.equal(typeof scorecard[0]!.trends.vsLastWeek.label, "string");
  });

  it("generates narrative text for today, week, and 30-day outlook", async () => {
    const snapshot = await buildExecutiveMorningBriefSnapshot({
      bundle: minimalBundle(),
      persistRecommendations: false,
    });
    assert.ok(snapshot.narratives.today.length > 20);
    assert.ok(snapshot.narratives.thisWeek.length > 10);
    assert.ok(snapshot.narratives.outlook30Day.includes("30-day"));
  });

  it("builds standalone narratives from partial snapshot", () => {
    const narratives = buildExecutiveNarratives({
      recruitingHealth: { score: 55, tier: "at-risk", summary: "Needs attention" },
      territoryRisks: [
        {
          rank: 1,
          territoryLabel: "Houston",
          dmName: SAMPLE_DM,
          riskLevel: "critical",
          coveragePercent: 38,
          openCalls: 4,
          applicants: 2,
          activeReps: 1,
          riskTrend: "declining",
          riskScore: 82,
        },
      ],
      dailyPriorities: [],
      recommendationIntelligence: {
        topPerforming: [
          {
            recommendationType: "refresh-job-posting",
            label: "Refreshing postings",
            successRate: 72,
            trackedCount: 10,
            trendChange: 1,
          },
        ],
        worstPerforming: [],
        overallSuccessRate: 72,
        roiHighlights: [],
      },
      automationOpportunities: {
        jobRefreshDrafts: 1,
        postingDrafts: 0,
        followUpCampaigns: 0,
        pendingApprovals: 2,
        highestImpact: [],
      },
      coverageForecast: [
        {
          horizon: "14d",
          expectedOpenCalls: 3,
          expectedFilledCalls: 1,
          expectedCoveragePercent: 45,
          projectedRiskScore: 55,
          riskTrend: "stable",
        },
      ],
    });
    assert.match(narratives.today, /Recruiting health/);
    assert.match(narratives.today, /Refreshing postings/);
    assert.match(narratives.today, /automation actions are awaiting approval/);
  });

  it("builds morning brief snapshot with priorities and forecasts", async () => {
    const snapshot = await buildExecutiveMorningBriefSnapshot({
      bundle: minimalBundle(),
      persistRecommendations: false,
    });
    assert.equal(snapshot.planDate, "2026-06-15");
    assert.ok(snapshot.scorecard.length > 0);
    assert.ok(snapshot.coverageForecast.length >= 4);
    assert.ok(snapshot.emailDigest.bodyText.includes("Top Risks") || snapshot.emailDigest.bodyText.length > 20);
  });

  it("ranks daily priorities from intelligence bundle", () => {
    const priorities = buildMorningBriefPriorities({
      bundle: minimalBundle(),
      alerts: [],
    });
    assert.ok(Array.isArray(priorities));
    assert.ok(priorities.length <= 10);
  });

  it("generates email digest draft without sending", async () => {
    const snapshot = await buildExecutiveMorningBriefSnapshot({
      bundle: minimalBundle(),
      persistRecommendations: false,
      emailRecipients: ["steve@example.com"],
    });
    assert.match(snapshot.emailDigest.subject, /Executive Morning Brief/);
    assert.deepEqual(snapshot.emailDigest.recipients, ["steve@example.com"]);
    const digest = buildEmailDigestDraft(snapshot, ["bill@example.com"]);
    assert.ok(digest.sections.recommendedActions.length >= 0);
    assert.ok(digest.bodyText.includes("Top Risks"));
  });

  it("exports CSV and print HTML", async () => {
    const snapshot = await buildExecutiveMorningBriefSnapshot({
      bundle: minimalBundle(),
      persistRecommendations: false,
    });
    const csv = buildMorningBriefExportCsv(snapshot);
    assert.match(csv, /Executive Morning Brief|Priority|Scorecard/);
    const html = buildMorningBriefPrintHtml(snapshot);
    assert.match(html, /<html>/);
    assert.match(html, /2026-06-15/);
  });

  it("returns empty snapshot when deferred", async () => {
    const snapshot = await buildExecutiveMorningBriefSnapshot({
      bundle: minimalBundle(),
      deferExpensive: true,
    });
    assert.equal(snapshot.dailyPriorities.length, 0);
    assert.match(snapshot.narratives.today, /cached intelligence/i);
    assert.equal(snapshot.ceoHome.onTrack, "yellow");
  });

  it("builds CEO home snapshot with traffic lights and narrative", async () => {
    const snapshot = await buildExecutiveMorningBriefSnapshot({
      bundle: minimalBundle(),
      persistRecommendations: false,
    });
    assert.ok(snapshot.ceoHome.narrative.length > 20);
    assert.ok(["green", "yellow", "red"].includes(snapshot.ceoHome.onTrack));
    assert.ok(snapshot.ceoHome.topPriorities.length <= 5);
    assert.ok(snapshot.ceoHome.topRisks.length <= 5);
    assert.ok(snapshot.ceoHome.topOpportunities.length <= 5);

    const rebuilt = buildCeoHomeSnapshot(snapshot);
    assert.equal(rebuilt.narrative, snapshot.ceoHome.narrative);
  });
});
