import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import { normalizeWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildCandidateReEngagementIntelligenceSnapshot,
  buildExecutiveRecoverySummary,
  buildRawReEngagementOpportunities,
  buildTerritoryRecoveryForecasts,
  classifyOpportunitySource,
  countBySegment,
  mapWorkflowActionToStatus,
  mergeReEngagementWorkflowState,
  rankReEngagementOpportunities,
  reEngagementAlertId,
  scoreOpportunityRanking,
  scoreReEngagementOpportunity,
  segmentReEngagementCandidate,
} from "@/lib/candidate-re-engagement-intelligence";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

const RECRUITER_NAME = "Jordan Miles";
const REFERENCE_MS = Date.parse("2026-06-15T12:00:00.000Z");

function recruiterSession(): AuthSession {
  return {
    userId: "recruiter-user",
    email: "recruiter@example.com",
    name: RECRUITER_NAME,
    role: "recruiter",
    territoryStates: ["TX", "CO"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function sampleCandidate(overrides: Partial<RecruitingIntelligenceRouteBundle["candidates"][number]> = {}) {
  return {
    candidateId: overrides.candidateId ?? "c1",
    firstName: overrides.firstName ?? "Jamie",
    lastName: overrides.lastName ?? "Rivera",
    email: "jamie@example.com",
    phone: "555-0100",
    source: "web",
    stage: overrides.stage ?? "applied",
    appliedDate: overrides.appliedDate ?? "2026-04-01T00:00:00.000Z",
    createdDate: "2026-04-01T00:00:00.000Z",
    addedDate: "2026-04-01T00:00:00.000Z",
    updatedDate: "2026-04-01T00:00:00.000Z",
    addedDateSource: "creation_date" as const,
    positionId: "job-1",
    positionName: "Retail Rep",
    city: "Houston",
    state: overrides.state ?? "TX",
    zipCode: "77001",
    resumeText: "",
    hasResume: false,
    ...overrides,
  };
}

function sampleBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates: [sampleCandidate()],
    workflows: {
      c1: normalizeWorkflowRecord("c1", {
        assignedRecruiter: RECRUITER_NAME,
        lastActionAt: "2026-04-10T00:00:00.000Z",
        recruitingActions: { needsFollowUp: true },
      }),
    },
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Alpha",
        client: "Client",
        storeAddress: "1 Main",
        storeName: "Store 101",
        city: "Houston",
        state: "TX",
        projectType: "Retail",
        priority: "High",
        openStatus: true,
        territoryOwner: "DM One",
        storeCall: "Open",
        projectNo: "P-1",
        isStaffed: false,
      },
    ],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: ["TX"],
      opportunities: [],
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
        lowDensityStates: [],
        highOpportunityLowRepMarkets: [],
      },
    },
    candidatesResult: { ok: true, candidates: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    fetchedAt: "2026-06-15T12:00:00.000Z",
    intelligenceCache: {
      cacheStatus: "fresh",
      snapshotAgeMs: 0,
      source: "memory",
    },
  };
}

describe("candidate re-engagement scoring", () => {
  it("scores stalled candidates with territory demand", () => {
    const bundle = sampleBundle();
    const row = buildBaselineWorkflowRow(bundle.candidates[0]!, bundle.workflows.c1);
    const score = scoreReEngagementOpportunity(row, bundle, REFERENCE_MS);
    assert.ok(score >= 15);
  });
});

describe("candidate re-engagement opportunity engine", () => {
  it("classifies abandoned and declined candidates", () => {
    const bundle = sampleBundle();
    const abandonedRow = buildBaselineWorkflowRow(bundle.candidates[0]!, bundle.workflows.c1);
    assert.equal(classifyOpportunitySource(abandonedRow, REFERENCE_MS), "abandoned");

    bundle.workflows.c1 = normalizeWorkflowRecord("c1", {
      assignedRecruiter: RECRUITER_NAME,
      workflowStatus: "Not Qualified",
    });
    const declinedRow = buildBaselineWorkflowRow(bundle.candidates[0]!, bundle.workflows.c1);
    assert.equal(classifyOpportunitySource(declinedRow, REFERENCE_MS), "declined-previously");
  });

  it("builds raw opportunities from scoped bundle rows", () => {
    const bundle = sampleBundle();
    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    const raw = buildRawReEngagementOpportunities({
      bundle,
      scope,
      referenceMs: REFERENCE_MS,
    });
    assert.ok(raw.length >= 1);
    assert.ok(raw[0]!.reEngagementScore >= 10);
  });
});

describe("candidate re-engagement segmentation", () => {
  it("maps scores to hot, warm, cold, and high-value segments", () => {
    assert.equal(
      segmentReEngagementCandidate({
        source: "stalled",
        reEngagementScore: 80,
        placementProbability: 70,
        matchPercent: 60,
      }),
      "hot",
    );
    assert.equal(
      segmentReEngagementCandidate({
        source: "stalled",
        reEngagementScore: 90,
        placementProbability: 85,
        matchPercent: 85,
      }),
      "high-value",
    );
    assert.equal(
      segmentReEngagementCandidate({
        source: "past-worker",
        reEngagementScore: 40,
        placementProbability: 30,
        matchPercent: 20,
      }),
      "former-worker",
    );

    const counts = countBySegment(["hot", "hot", "warm", "cold"]);
    assert.equal(counts.hot, 2);
    assert.equal(counts.warm, 1);
    assert.equal(counts.cold, 1);
  });
});

describe("candidate re-engagement ranking", () => {
  it("ranks opportunities by composite ranking score", () => {
    const bundle = sampleBundle();
    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    const raw = buildRawReEngagementOpportunities({
      bundle,
      scope,
      referenceMs: REFERENCE_MS,
    });
    const ranked = rankReEngagementOpportunities(
      raw.map((row) => ({
        ...row,
        rankingScore: scoreOpportunityRanking(row, bundle),
      })),
    );
    assert.ok(ranked.length >= 1);
    if (ranked.length > 1) {
      assert.ok(ranked[0]!.rankingScore >= ranked[1]!.rankingScore);
    }
  });
});

describe("candidate re-engagement forecasts", () => {
  it("builds territory recovery forecasts and executive summary", () => {
    const bundle = sampleBundle();
    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    const raw = buildRawReEngagementOpportunities({
      bundle,
      scope,
      referenceMs: REFERENCE_MS,
    });
    const forecasts = buildTerritoryRecoveryForecasts({ bundle, opportunities: raw });
    assert.ok(forecasts.length >= 1);
    assert.ok(forecasts[0]!.recoverableCandidates >= 1);

    const summary = buildExecutiveRecoverySummary({ opportunities: raw, forecasts });
    assert.equal(summary.recoverableCandidates, raw.length);
    assert.ok(summary.potentialPlacements >= 0);
    assert.ok(summary.topRecoveryTerritories.length >= 1);
  });
});

describe("candidate re-engagement workflow helpers", () => {
  it("maps workflow actions to executive alert statuses", () => {
    assert.equal(mapWorkflowActionToStatus("contacted"), "in-review");
    assert.equal(mapWorkflowActionToStatus("interested"), "resolved");
    assert.equal(mapWorkflowActionToStatus("not-interested"), "resolved");
  });

  it("merges workflow state from overlays and follow-ups", () => {
    const alertId = reEngagementAlertId("c1");
    const state = mergeReEngagementWorkflowState({
      candidateId: "c1",
      statusOverlays: [
        {
          alertId,
          userId: "u1",
          status: "in-review",
          updatedAt: "2026-06-15T12:00:00.000Z",
        },
      ],
      followUps: [
        {
          id: "fu-1",
          alertId,
          ownerKind: "recruiter",
          ownerName: RECRUITER_NAME,
          dueDate: "2026-06-16T12:00:00.000Z",
          priority: "high",
          createdAt: "2026-06-15T12:00:00.000Z",
          createdByUserId: "u1",
          createdByName: "Admin",
        },
      ],
    });
    assert.equal(state.workflowStatus, "in-review");
    assert.equal(state.workflowAlertId, alertId);
    assert.equal(state.followUpDueAt, "2026-06-16T12:00:00.000Z");
  });
});

describe("candidate re-engagement snapshot", () => {
  it("builds end-to-end intelligence snapshot with top 25 and top 100", () => {
    const snapshot = buildCandidateReEngagementIntelligenceSnapshot({
      session: recruiterSession(),
      bundle: sampleBundle(),
      followUps: [],
      statusOverlays: [],
      actionLogs: [],
      referenceMs: REFERENCE_MS,
    });

    assert.equal(snapshot.scope.recruiterName, RECRUITER_NAME);
    assert.ok(snapshot.executiveSummary.recoverableCandidates >= 1);
    assert.ok(snapshot.top25.length >= 1);
    assert.ok(snapshot.top100.length >= snapshot.top25.length);
    assert.ok(snapshot.territoryForecasts.length >= 1);
    assert.ok(snapshot.outreachRecommendations.length >= 1);
    assert.ok(snapshot.top25[0]!.outreach.impactScore >= 0);
  });
});
