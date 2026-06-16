import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import { normalizeWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildCandidatePriorities,
  buildPipelineHealth,
  buildRecruiterActionQueue,
  buildRecruiterOperatingSystemSnapshot,
  buildReEngagementCenter,
  compareCandidatePriorities,
  compareRecruiterActionQueueItems,
  detectPipelineBottlenecks,
  isRecruiterNameInScope,
  resolveRecruiterOperatingSystemScope,
  scoreCandidatePriority,
  scoreReEngagementOpportunity,
} from "@/lib/recruiter-operating-system";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildDailyActionWorkQueueItem } from "@/lib/unified-recruiting-command-center";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";

const RECRUITER_NAME = "Jordan Miles";
const OTHER_RECRUITER = "Alex Chen";
const REFERENCE_MS = Date.parse("2026-06-15T12:00:00.000Z");

function recruiterSession(name: string = RECRUITER_NAME): AuthSession {
  return {
    userId: "recruiter-user",
    email: "recruiter@example.com",
    name,
    role: "recruiter",
    territoryStates: ["TX", "CO"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function adminSession(): AuthSession {
  return {
    userId: "admin-user",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    territoryStates: [],
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
    appliedDate: overrides.appliedDate ?? "2026-06-14T00:00:00.000Z",
    createdDate: "2026-06-14T00:00:00.000Z",
    addedDate: "2026-06-14T00:00:00.000Z",
    updatedDate: "2026-06-14T00:00:00.000Z",
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

describe("recruiter operating system permissions", () => {
  it("scopes recruiters to their own assignments", () => {
    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    assert.equal(scope.scopedToRecruiter, true);
    assert.equal(scope.recruiterName, RECRUITER_NAME);
    assert.ok(isRecruiterNameInScope(RECRUITER_NAME, scope));
    assert.equal(isRecruiterNameInScope(OTHER_RECRUITER, scope), false);
  });

  it("allows admin to request a specific recruiter scope", () => {
    const scope = resolveRecruiterOperatingSystemScope(adminSession(), OTHER_RECRUITER);
    assert.equal(scope.scopedToRecruiter, true);
    assert.equal(scope.recruiterName, OTHER_RECRUITER);
  });
});

describe("recruiter operating system candidate ranking", () => {
  it("ranks candidates by heat and priority score", () => {
    const bundle = sampleBundle();
    bundle.candidates.push(
      sampleCandidate({
        candidateId: "c2",
        firstName: "Casey",
        lastName: "Ng",
        appliedDate: "2026-05-01T00:00:00.000Z",
      }),
    );
    bundle.workflows.c2 = normalizeWorkflowRecord("c2", {
      assignedRecruiter: RECRUITER_NAME,
    });

    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    const priorities = buildCandidatePriorities({
      bundle,
      scope,
      referenceMs: REFERENCE_MS,
    });

    assert.ok(priorities.length >= 2);
    assert.equal(compareCandidatePriorities(priorities[0]!, priorities[1]!) <= 0, true);
    assert.ok(["hot", "warm", "cold", "at-risk"].includes(priorities[0]!.heat));

    const row = buildBaselineWorkflowRow(bundle.candidates[0]!, bundle.workflows.c1);
    const score = scoreCandidatePriority(row, bundle, REFERENCE_MS);
    assert.ok(score > 0);
  });
});

describe("recruiter operating system action prioritization", () => {
  it("prioritizes recruiter action queue by composite score", () => {
    const bundle = sampleBundle();
    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    const recommendation: AutopilotRecommendation = {
      id: "rec-1",
      kind: "create-candidate-outreach-campaign",
      title: "Launch outreach",
      entityType: "recruiter",
      entityId: "recruiter:jordan",
      entityLabel: RECRUITER_NAME,
      impactScore: 80,
      confidenceScore: 70,
      estimatedOutcomeImprovement: 50,
      reasoning: "Need candidates",
      supportingMetrics: [],
      opportunity: {
        currentRisk: 60,
        potentialImprovement: 20,
        estimatedCandidateGain: 4,
        estimatedCoverageGain: 6,
        estimatedCompletionGain: 2,
        expectedRoiScore: 55,
      },
      prioritizationScore: 75,
      horizon: "quick-win",
      navigation: { tabId: "recruiting-autopilot", label: "Open" },
    };
    const dailyAction: DailyActionPlanItem = {
      id: "daily-1",
      alertId: "alert-1",
      bucket: "must-do-today",
      title: "Follow up candidates",
      owner: RECRUITER_NAME,
      ownerKind: "recruiter",
      dueDate: "2026-06-15T23:59:59.000Z",
      expectedImpact: 70,
      expectedCoverageGain: 5,
      expectedHireGain: 1,
      reasoning: "Queue aging",
      links: {
        recommendationId: "rec-1",
        recommendationKind: "create-candidate-outreach-campaign",
        recommendationTitle: "Launch outreach",
        riskScore: 60,
      },
      navigation: { tabId: "daily-action-plan", label: "Open" },
      status: "new",
      recommendation,
    };

    const queue = buildRecruiterActionQueue({
      bundle,
      workQueue: [buildDailyActionWorkQueueItem(dailyAction, REFERENCE_MS)],
      scope,
      referenceMs: REFERENCE_MS,
    });

    assert.ok(queue.length >= 1);
    if (queue.length >= 2) {
      assert.equal(
        compareRecruiterActionQueueItems(queue[0]!, queue[1]!) <= 0,
        true,
      );
    }
  });
});

describe("recruiter operating system re-engagement scoring", () => {
  it("scores stalled and abandoned candidates for re-engagement", () => {
    const bundle = sampleBundle();
    bundle.candidates[0] = sampleCandidate({
      appliedDate: "2026-04-01T00:00:00.000Z",
    });
    bundle.workflows.c1 = normalizeWorkflowRecord("c1", {
      assignedRecruiter: RECRUITER_NAME,
      lastActionAt: "2026-04-10T00:00:00.000Z",
    });

    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    const row = buildBaselineWorkflowRow(bundle.candidates[0]!, bundle.workflows.c1);
    const score = scoreReEngagementOpportunity(row, bundle, REFERENCE_MS);
    assert.ok(score >= 15);

    const center = buildReEngagementCenter({
      bundle,
      scope,
      referenceMs: REFERENCE_MS,
    });
    assert.ok(center.length >= 1);
    assert.ok(center[0]!.opportunityScore >= score);
  });
});

describe("recruiter operating system pipeline bottlenecks", () => {
  it("detects pipeline bottlenecks from stage aging", () => {
    const bundle = sampleBundle();
    bundle.candidates = [
      sampleCandidate({ candidateId: "c1" }),
      sampleCandidate({ candidateId: "c2", firstName: "A", lastName: "One" }),
      sampleCandidate({ candidateId: "c3", firstName: "B", lastName: "Two" }),
    ];
    for (const id of ["c1", "c2", "c3"]) {
      bundle.workflows[id] = normalizeWorkflowRecord(id, {
        assignedRecruiter: RECRUITER_NAME,
        lastActionAt: "2026-05-01T00:00:00.000Z",
        recruitingActions: { needsFollowUp: true },
      });
    }

    const scope = resolveRecruiterOperatingSystemScope(recruiterSession());
    const health = buildPipelineHealth({
      bundle,
      scope,
      referenceMs: REFERENCE_MS,
    });
    const bottlenecks = detectPipelineBottlenecks(health.stages);
    assert.ok(health.totalCandidates >= 3);
    assert.ok(bottlenecks.length >= 1);
    assert.ok(["high", "medium", "low"].includes(bottlenecks[0]!.severity));
  });
});

describe("recruiter operating system snapshot", () => {
  it("builds end-to-end recruiter operating system snapshot", () => {
    const snapshot = buildRecruiterOperatingSystemSnapshot({
      session: recruiterSession(),
      bundle: sampleBundle(),
      followUps: [],
      statusOverlays: [],
      actionLogs: [],
      referenceMs: REFERENCE_MS,
    });

    assert.equal(snapshot.scope.recruiterName, RECRUITER_NAME);
    assert.ok(snapshot.kpis.activeCandidates >= 1);
    assert.ok(Array.isArray(snapshot.actionQueue));
    assert.ok(snapshot.dailyPlan.length <= 25);
    assert.ok(snapshot.candidatePriorities.length >= 1);
    assert.ok(snapshot.productivityMetrics.length === 3);
  });

  it("excludes other recruiters when scoped", () => {
    const bundle = sampleBundle();
    bundle.candidates.push(
      sampleCandidate({
        candidateId: "c-other",
        firstName: "Other",
        lastName: "Recruiter",
      }),
    );
    bundle.workflows["c-other"] = normalizeWorkflowRecord("c-other", {
      assignedRecruiter: OTHER_RECRUITER,
    });

    const snapshot = buildRecruiterOperatingSystemSnapshot({
      session: recruiterSession(),
      bundle,
      referenceMs: REFERENCE_MS,
    });

    assert.equal(
      snapshot.candidatePriorities.every((row) => row.candidateId !== "c-other"),
      true,
    );
  });
});
