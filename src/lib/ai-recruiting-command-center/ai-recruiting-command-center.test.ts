import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import {
  answerExecutiveQuestion,
  buildAiCommandCenterSnapshot,
  buildAiInsightsFeed,
  buildDailyExecutiveBriefing,
  SUGGESTED_EXECUTIVE_QUESTIONS,
} from "@/lib/ai-recruiting-command-center";
import { buildCommandCenterDmInsights } from "@/lib/command-center-dm-insights";
import { buildRecruitingCommandCenter } from "@/lib/recruiting-command-center";
import { buildDailyExecutiveSnapshot } from "@/lib/recruiting-automation/daily-executive-snapshot";

function sampleCandidate(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@test.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-05-27",
    createdDate: "",
    addedDate: "",
    updatedDate: "2026-05-27",
    addedDateSource: "",
    positionId: "j1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
    hasResume: false,
    ...overrides,
  };
}

function sampleJob(overrides: Partial<BreezyJob> = {}): BreezyJob {
  return {
    positionId: "j1",
    name: "Merchandiser - Dallas",
    state: "TX",
    city: "Dallas",
    department: "Field",
    status: "published",
    createdDate: "2026-05-01",
    updatedDate: "2026-05-20",
    ...overrides,
  };
}

function sampleOpportunity(overrides: Partial<MelOpportunity> = {}): MelOpportunity {
  return {
    opportunityId: "opp-1",
    projectName: "Walmart Reset",
    client: "Acme",
    storeAddress: "100 Main",
    storeName: "Store 42",
    city: "Fort Worth",
    state: "TX",
    projectType: "Reset",
    priority: "high",
    openStatus: true,
    territoryOwner: "Amy Harp",
    storeCall: "SC-1",
    projectNo: "P-100",
    isStaffed: false,
    ...overrides,
  };
}

function sampleRep(overrides: Partial<ActiveRep> = {}): ActiveRep {
  return {
    repId: "rep-1",
    name: "Jordan Smith",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    lat: 32.7767,
    lng: -96.797,
    active: true,
    skills: ["merchandising"],
    travelRadius: 120,
    lastProjectDate: "2026-05-10",
    completionRate: 0.92,
    noShowRate: 0.04,
    dmOwner: "Amy Harp",
    melStatus: "active",
    trainingStatus: "certified",
    openAssignments: 1,
    completedAssignments: 24,
    ...overrides,
  };
}

function breezySuccess<T extends { ok: true }>(payload: Omit<T, "ok">): T {
  return { ok: true, ...payload } as T;
}

describe("ai-recruiting-command-center", () => {
  it("exposes suggested executive questions", () => {
    assert.ok(SUGGESTED_EXECUTIVE_QUESTIONS.length >= 4);
    assert.ok(SUGGESTED_EXECUTIVE_QUESTIONS[0]!.includes("territor"));
  });

  it("builds unified AI command center snapshot", () => {
    const jobs = [sampleJob()];
    const candidates = [sampleCandidate()];
    const fetchedAt = "2026-05-28T12:00:00.000Z";
    const commandCenter = buildRecruitingCommandCenter(
      breezySuccess({
        candidates,
        fetchedAt,
        companyId: "co-1",
      }),
      breezySuccess({
        jobs,
        fetchedAt,
        companyId: "co-1",
        state: "published",
      }),
    );

    const snapshot = buildAiCommandCenterSnapshot({
      jobs,
      candidates,
      workflows: null,
      opportunities: [sampleOpportunity()],
      activeReps: [sampleRep()],
      coverage: null,
      fetchedAt,
      territoryStates: ["TX"],
      commandCenter,
    });

    assert.ok(snapshot.briefing.summary.length > 0);
    assert.ok(snapshot.insightsFeed.length > 0);
    assert.ok(snapshot.territoryAdvisor.length > 0);
    assert.ok(Array.isArray(snapshot.opportunityRisks));
    assert.equal(snapshot.suggestedQuestions.length, 4);
  });

  it("answers territory attention questions", () => {
    const jobs = [sampleJob()];
    const candidates = [sampleCandidate()];
    const fetchedAt = "2026-05-28T12:00:00.000Z";
    const commandCenter = buildRecruitingCommandCenter(
      breezySuccess({ candidates, fetchedAt, companyId: "co-1" }),
      breezySuccess({ jobs, fetchedAt, companyId: "co-1", state: "published" }),
    );
    const snapshot = buildAiCommandCenterSnapshot({
      jobs,
      candidates,
      workflows: null,
      opportunities: [],
      activeReps: [sampleRep()],
      coverage: null,
      fetchedAt,
      commandCenter,
    });

    const answer = answerExecutiveQuestion("Which territories need attention?", snapshot);
    assert.ok(answer.answer.length > 0);
    assert.ok(answer.confidence > 0);
  });

  it("builds executive briefing sections", () => {
    const jobs = [sampleJob()];
    const candidates = [sampleCandidate()];
    const fetchedAt = "2026-05-28T12:00:00.000Z";
    const commandCenter = buildRecruitingCommandCenter(
      breezySuccess({ candidates, fetchedAt, companyId: "co-1" }),
      breezySuccess({ jobs, fetchedAt, companyId: "co-1", state: "published" }),
    );
    const dmInsights = buildCommandCenterDmInsights({
      jobs,
      candidates,
      fetchedAt,
      coverage: null,
      workflows: null,
      commandCenter,
    });
    const briefing = buildDailyExecutiveBriefing({
      fetchedAt,
      commandCenter,
      dmInsights,
      dailyExecutive: buildDailyExecutiveSnapshot(jobs, candidates, fetchedAt),
      criticalNotifications: [],
      coverageOptimization: null,
    });

    assert.ok(briefing.topRisks.items.length > 0);
    assert.ok(briefing.hiringTrends.items.length > 0);
    assert.ok(briefing.summary.length > 0);
  });

  it("ranks insights feed by severity and score", () => {
    const feed = buildAiInsightsFeed({
      briefing: {
        generatedAt: "2026-05-28T12:00:00.000Z",
        topRisks: { title: "Top risks", items: ["Risk A"] },
        topWins: { title: "Top wins", items: [] },
        hiringTrends: { title: "Trends", items: [] },
        coverageChanges: { title: "Coverage", items: [] },
        criticalAlerts: { title: "Alerts", items: [] },
        summary: "Summary",
      },
      dmInsights: {
        fetchedAt: "2026-05-28T12:00:00.000Z",
        territories: [],
        topTerritoriesNeedingAttention: [],
        recruitingHealth: { applicantsLast7Days: 1, paperworkSent: 0, readyForMel: 0, hired: 0 },
        riskAlerts: { criticalShortages: [], unstaffedHighPriority: [], belowThreshold: [] },
        hasCoverageData: false,
      },
      territoryAdvisor: [],
      recruiterCoach: {
        pipelineSummary: "Pipeline clear",
        followUpSummary: "No follow-ups",
        conversionSummary: "N/A",
        productivityTrend: "Stable",
        candidatesToContact: [],
        jobsNeedingApplicants: [{ jobId: "j1", title: "Merchandiser", reason: "Zero applicants" }],
        followUpsDueToday: [],
      },
      opportunityRisks: [
        {
          opportunityId: "opp-1",
          projectName: "Reset",
          fillProbability: 20,
          coverageRisk: 80,
          deadlineRisk: 90,
          staffingShortageRisk: 85,
          overallRiskScore: 88,
          explanation: "High risk",
        },
      ],
      criticalNotifications: [],
    });

    assert.ok(feed.length > 0);
    assert.ok(feed[0]!.score >= feed[feed.length - 1]!.score || feed[0]!.severity === "critical");
  });
});
