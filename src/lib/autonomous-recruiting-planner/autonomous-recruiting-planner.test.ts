import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import { normalizeWorkflowRecord } from "@/lib/candidate-workflow-types";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import {
  buildAutonomousRecruitingPlannerSnapshot,
  buildGoalPlanningResult,
  buildRecruitingPlans,
  buildTerritoryActionPlans,
  buildRecruiterWorkPlans,
  computeOptimizationScore,
  rankPlansByOptimization,
} from "@/lib/autonomous-recruiting-planner";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import { buildUnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center";
import { buildWorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";

const SAMPLE_DM = DISTRICT_MANAGERS[0] ?? "DM One";
const RECRUITER_NAME = "Jordan Miles";
const REFERENCE_MS = Date.parse("2026-06-15T12:00:00.000Z");

function executiveSession(): AuthSession {
  return {
    userId: "exec-user",
    email: "exec@example.com",
    name: "Executive User",
    role: "executive",
    territoryStates: [],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function dmSession(): AuthSession {
  return {
    userId: "dm-user",
    email: "dm@example.com",
    name: SAMPLE_DM,
    role: "dm",
    dmName: SAMPLE_DM,
    territoryStates: ["TX"],
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
    jobs: [
      {
        jobId: "job-1",
        title: "Retail Rep",
        state: "TX",
        city: "Houston",
        status: "published",
        createdDate: "2026-01-01T00:00:00.000Z",
        updatedDate: "2026-06-01T00:00:00.000Z",
      },
    ],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates: [
      sampleCandidate(),
      sampleCandidate({ candidateId: "c2", firstName: "Alex" }),
      sampleCandidate({ candidateId: "c3", firstName: "Sam", stage: "hired" }),
    ],
    workflows: {
      c1: normalizeWorkflowRecord("c1", {
        assignedRecruiter: RECRUITER_NAME,
        workflowStatus: "Qualified",
        lastActionAt: "2026-04-10T00:00:00.000Z",
        recruitingActions: { needsFollowUp: true },
      }),
      c2: normalizeWorkflowRecord("c2", {
        assignedRecruiter: RECRUITER_NAME,
        workflowStatus: "Paperwork Sent",
        lastActionAt: "2026-05-01T00:00:00.000Z",
      }),
      c3: normalizeWorkflowRecord("c3", {
        assignedRecruiter: RECRUITER_NAME,
        workflowStatus: "Active Rep",
        lastActionAt: "2026-06-10T00:00:00.000Z",
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
        territoryOwner: SAMPLE_DM,
        storeCall: "Open",
        projectNo: "P-1",
        isStaffed: false,
      },
      {
        opportunityId: "opp-2",
        projectName: "Beta",
        client: "Client",
        storeAddress: "2 Main",
        storeName: "Store 202",
        city: "Dallas",
        state: "TX",
        projectType: "Retail",
        priority: "High",
        openStatus: true,
        territoryOwner: SAMPLE_DM,
        storeCall: "Open",
        projectNo: "P-2",
        isStaffed: false,
      },
    ],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: ["TX"],
      opportunities: [
        {
          opportunityId: "opp-1",
          projectName: "Alpha",
          client: "Client",
          storeName: "Store 101",
          city: "Houston",
          state: "TX",
          territoryOwner: SAMPLE_DM,
          priority: "high",
          nearby: {
            within10: 0,
            within25: 1,
            within50: 2,
            activeWithin50: 1,
            inactiveWithin50: 1,
          },
          activeRepDensity: 1,
          skillMatchScore: 20,
          recentLoginScore: 10,
          territoryAlignmentScore: 15,
          pipelineScore: 18,
          coverageScore: 42,
          staffingRisk: "RED",
          recommendedAction: "Escalate",
          topRecommendedReps: [],
        },
      ],
      executiveSummary: {
        totalOpenOpportunities: 2,
        highRiskProjectCount: 1,
        yellowRiskProjectCount: 1,
        zeroNearbyRepProjects: 1,
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
    candidatesResult: { ok: true, candidates: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    fetchedAt: "2026-06-15T12:00:00.000Z",
    melOk: true,
    intelligenceCache: {
      cacheStatus: "fresh",
      snapshotAgeMs: 0,
      source: "memory",
      hitCount: 1,
      missCount: 0,
      lastRefreshAt: "2026-06-15T12:00:00.000Z",
    },
  };
}

function buildPlannerContext() {
  const bundle = sampleBundle();
  const session = executiveSession();
  const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle,
    alerts: [],
    followUps: [],
    referenceMs: REFERENCE_MS,
  });
  const autopilot = buildRecruitingAutopilotSnapshot({
    bundle,
    alerts: [],
    followUps: [],
  });
  const commandCenter = buildUnifiedRecruitingCommandCenterSnapshot({
    bundle,
    followUps: [],
    referenceMs: REFERENCE_MS,
  });
  const workforce = buildWorkforceCapacityForecastSnapshot({
    session,
    bundle,
    followUps: [],
    referenceMs: REFERENCE_MS,
  });
  const dailyActionPlan = buildDailyActionPlanSnapshot({
    bundle,
    alerts: [],
    followUps: [],
    referenceMs: REFERENCE_MS,
  });
  return { bundle, session, riskSnapshot, autopilot, commandCenter, workforce, dailyActionPlan };
}

describe("autonomous recruiting planner optimization", () => {
  it("computes optimization score from outcome metrics", () => {
    const score = computeOptimizationScore({
      coveragePercent: 80,
      completionPercent: 70,
      expectedHires: 10,
      openCallsReduced: 5,
      riskReduction: 20,
      criticalTerritories: 1,
    });
    assert.ok(score >= 40);
    assert.ok(score <= 100);
  });

  it("ranks plans by optimization score descending", () => {
    const plans = [
      {
        id: "a",
        horizon: "7d" as const,
        label: "7d",
        optimizationScore: 50,
        confidenceScore: 70,
        outcomes: {
          coveragePercent: 60,
          completionPercent: 50,
          expectedHires: 2,
          openCallsReduced: 1,
          riskReduction: 5,
          criticalTerritories: 2,
        },
        headline: "a",
        keyActions: [],
      },
      {
        id: "b",
        horizon: "30d" as const,
        label: "30d",
        optimizationScore: 80,
        confidenceScore: 75,
        outcomes: {
          coveragePercent: 85,
          completionPercent: 75,
          expectedHires: 12,
          openCallsReduced: 8,
          riskReduction: 25,
          criticalTerritories: 0,
        },
        headline: "b",
        keyActions: [],
      },
    ];
    const ranked = rankPlansByOptimization(plans);
    assert.equal(ranked[0]!.id, "b");
    assert.equal(ranked[1]!.id, "a");
  });
});

describe("autonomous recruiting planner generation", () => {
  it("builds 7/14/30 day recruiting plans", () => {
    const ctx = buildPlannerContext();
    const plans = buildRecruitingPlans({
      commandCenter: ctx.commandCenter,
      workforce: ctx.workforce,
      autopilot: ctx.autopilot,
      recoverableCandidates: 5,
      pipelineDepth: ctx.bundle.candidates.length,
    });
    assert.equal(plans.length, 3);
    const horizons = plans.map((plan) => plan.horizon);
    assert.deepEqual(horizons, ["7d", "14d", "30d"]);
    for (const plan of plans) {
      assert.ok(plan.optimizationScore >= 0);
      assert.ok(plan.confidenceScore >= 35);
      assert.ok(plan.keyActions.length >= 0);
      assert.ok(plan.outcomes.expectedHires >= 0);
    }
    const thirtyDay = plans.find((plan) => plan.horizon === "30d")!;
    const sevenDay = plans.find((plan) => plan.horizon === "7d")!;
    assert.ok(thirtyDay.outcomes.expectedHires >= sevenDay.outcomes.expectedHires);
  });

  it("builds full snapshot with executive strategy and goals", () => {
    const bundle = sampleBundle();
    const snapshot = buildAutonomousRecruitingPlannerSnapshot({
      session: executiveSession(),
      bundle,
      followUps: [],
      referenceMs: REFERENCE_MS,
    });
    assert.equal(snapshot.plans.length, 3);
    assert.ok(snapshot.executiveStrategy.bestPlan);
    assert.ok(snapshot.executiveStrategy.headline.length > 0);
    assert.equal(snapshot.goalPlanning.goals.length, 4);
    assert.ok(snapshot.resourceAllocation.length >= 0);
    assert.ok(snapshot.projectOutlooks.length >= 1);
    assert.ok(snapshot.riskConstraints.constraints.length >= 0);
  });

  it("scopes DM snapshot to territory states", () => {
    const snapshot = buildAutonomousRecruitingPlannerSnapshot({
      session: dmSession(),
      bundle: sampleBundle(),
      followUps: [],
      referenceMs: REFERENCE_MS,
    });
    assert.equal(snapshot.scope.scopedToTerritory, true);
    assert.deepEqual(snapshot.scope.territoryStates, ["TX"]);
  });
});

describe("autonomous recruiting planner goal planning", () => {
  it("simulates goals with required actions", () => {
    const ctx = buildPlannerContext();
    const plans = buildRecruitingPlans({
      commandCenter: ctx.commandCenter,
      workforce: ctx.workforce,
      autopilot: ctx.autopilot,
      recoverableCandidates: 8,
      pipelineDepth: ctx.bundle.candidates.length,
    });
    const bestPlan = rankPlansByOptimization(plans)[0]!;
    const goals = buildGoalPlanningResult({
      commandCenter: ctx.commandCenter,
      autopilot: ctx.autopilot,
      bestPlan,
      goalParams: { targetCoveragePercent: 95 },
    });
    assert.equal(goals.goals.length, 4);
    const coverageGoal = goals.goals.find((goal) => goal.kind === "coverage-95");
    assert.ok(coverageGoal);
    assert.equal(coverageGoal.targetValue, 95);
    assert.ok(coverageGoal.requiredActions.length >= 1);
    assert.ok(goals.summary.length > 0);
  });
});

describe("autonomous recruiting planner territory and recruiter plans", () => {
  it("builds territory action plans with impact and confidence", () => {
    const ctx = buildPlannerContext();
    const plans = buildTerritoryActionPlans({
      riskSnapshot: ctx.riskSnapshot,
      autopilot: ctx.autopilot,
    });
    for (const plan of plans) {
      assert.ok(plan.territoryLabel.length > 0);
      for (const action of plan.actions) {
        assert.ok(action.title.length > 0);
        assert.ok(["low", "medium", "high"].includes(action.effort));
        assert.ok(["low", "medium", "high"].includes(action.confidence));
        assert.ok(action.impactScore >= 0);
      }
    }
  });

  it("builds recruiter work plans with priorities", () => {
    const ctx = buildPlannerContext();
    const plans = buildRecruiterWorkPlans({
      bundle: ctx.bundle,
      workforce: ctx.workforce,
      dailyActionPlan: ctx.dailyActionPlan,
      followUps: [],
      referenceMs: REFERENCE_MS,
    });
    assert.ok(plans.length >= 1);
    const recruiter = plans.find((plan) => plan.recruiterName === RECRUITER_NAME);
    assert.ok(recruiter);
    assert.ok(recruiter.candidatePriorities.length >= 1);
    assert.ok(recruiter.capacityState.length > 0);
    assert.ok(recruiter.workloadSummary.length > 0);
  });
});
