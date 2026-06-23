import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { applyRecommendationFeedbackToAds } from "@/lib/autonomous-recruiting-autopilot/apply-feedback-priority";
import {
  loadAutopilotPolicy,
  pauseAutopilot,
  resumeAutopilot,
  saveAutopilotPolicy,
  setAutopilotMode,
} from "@/lib/autonomous-recruiting-autopilot/autopilot-policy-store";
import { approveCorrelationWithP59Accountability } from "@/lib/autonomous-recruiting-autopilot/bridge-p59-accountability";
import { buildAutopilotPerformance } from "@/lib/autonomous-recruiting-autopilot/build-autopilot-performance";
import { buildRecommendationFeedback } from "@/lib/autonomous-recruiting-autopilot/build-recommendation-feedback";
import {
  executeEligibleRecommendations,
  resolveAutopilotAutonomy,
} from "@/lib/autonomous-recruiting-autopilot/run-autopilot-planning";
import { planCorrelationsFromSnapshot } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type { RecruitingExecutionSnapshot } from "@/lib/autonomous-recruiting-execution";

const DATA_DIR = path.join(process.cwd(), ".data");
const POLICY_PATH = path.join(DATA_DIR, "autonomous-recruiting-autopilot-policy.json");
const RUNS_PATH = path.join(DATA_DIR, "autonomous-recruiting-autopilot-runs.json");
const FEEDBACK_PATH = path.join(DATA_DIR, "autonomous-recruiting-feedback.json");
const CORRELATION_PATH = path.join(DATA_DIR, "autopilot-execution-correlation.json");
const ACCOUNTABILITY_PATH = path.join(DATA_DIR, "executive-accountability.json");
const LEGACY_EXECUTIONS_PATH = path.join(DATA_DIR, "autopilot-executions.json");
const LEGACY_TASKS_PATH = path.join(DATA_DIR, "autopilot-recruiter-tasks.json");

function emptySnapshot(): AutonomousRecruitingSnapshot {
  return {
    fetchedAt: "2026-06-23T12:00:00.000Z",
    territoryStates: ["TX"],
    kpis: {
      coverageNeedsDetected: 1,
      adsRecommended: 1,
      adsAutoApproved: 1,
      candidatesRecommendedForHire: 1,
      estimatedHoursSaved: 1,
      hoursSavedFormula: "",
    },
    pipelineFlow: [],
    coverageNeeds: [
      {
        territoryKey: "dm-tx:TX",
        territoryLabel: "Texas DM",
        dmName: "Taylor",
        states: ["TX"],
        openCalls: 2,
        activeReps: 1,
        pipelineCandidates: 1,
        applicantCount: 2,
        coverageStatus: "Critical",
        coverageNeedScore: 90,
        drivers: [],
        recommendedAction: "Post",
      },
    ],
    postingRecommendations: [
      {
        id: "ad-1",
        title: "Merchandiser",
        city: "Dallas",
        state: "TX",
        territory: "Texas DM",
        reason: "Gap",
        expectedApplicants: { min: 2, max: 6 },
        priority: "high",
        approvalStatus: "auto-approved",
        adType: "create-new-ad",
      },
    ],
    hiringRecommendations: [
      {
        candidateId: "c1",
        candidateName: "Sam",
        positionName: "Merch",
        city: "Dallas",
        state: "TX",
        territory: "Texas DM",
        recommendedAction: "Hire Now",
        grade: "A",
        confidence: "high",
        coverageContext: "Critical",
        reasons: [],
      },
    ],
    approvalRules: [],
    automationRuns: {
      pending: 0,
      approved: 0,
      executed: 0,
      failed: 0,
      rejected: 0,
      generatedAt: "2026-06-23T12:00:00.000Z",
    },
  };
}

function emptyExecutionSnapshot(): RecruitingExecutionSnapshot {
  return {
    fetchedAt: "2026-06-23T12:00:00.000Z",
    kpis: {
      recommendationsGenerated: 1,
      approved: 1,
      inProgress: 0,
      completed: 1,
      postingSuccessRate: 100,
      applicantConversionRate: 50,
      timeSaved: 1,
      coverageRiskReduction: 0,
      hoursSavedFormula: "",
    },
    executionFunnel: [],
    executionQueue: [
      {
        id: "corr-1",
        recommendationId: "ad-1",
        territory: "Texas DM",
        type: "posting",
        priority: "high",
        status: "completed",
        createdAt: "2026-06-23T12:00:00.000Z",
        adType: "create-new-ad",
        jobDraftId: "draft-1",
        accountabilityActionId: "ea-1",
      },
    ],
    postingAutomation: [],
    recruiterTaskQueue: [],
    applicantPerformance: [
      {
        territoryKey: "dm-tx:TX",
        territoryLabel: "Texas DM",
        applicants: 4,
        qualified: 2,
        interview: 1,
        readyForMel: 1,
        targetApplicants: 6,
        timeToFillDays: 12,
        alerts: [],
      },
    ],
    auditLog: [],
    outcomes: [
      { id: "posting-success-rate", label: "", value: 100 },
      { id: "applicant-conversion", label: "", value: 50 },
      { id: "coverage-risk-reduction", label: "", value: 10 },
    ],
  };
}

before(async () => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    POLICY_PATH,
    JSON.stringify({
      policy: { mode: "semi-automatic", paused: false, updatedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    }),
  );
  await writeFile(RUNS_PATH, JSON.stringify({ runs: [], updatedAt: new Date().toISOString() }));
  await writeFile(
    FEEDBACK_PATH,
    JSON.stringify({ territoryWeights: {}, typeWeights: {}, updatedAt: new Date().toISOString() }),
  );
});

after(async () => {
  await rm(POLICY_PATH, { force: true });
  await rm(RUNS_PATH, { force: true });
  await rm(FEEDBACK_PATH, { force: true });
});

describe("autonomous-recruiting-autopilot", () => {
  it("stores autopilot policy separately from recommendation state", async () => {
    const policy = await setAutopilotMode("automatic");
    assert.equal(policy.mode, "automatic");

    const paused = await pauseAutopilot("exec");
    assert.equal(paused.paused, true);

    const resumed = await resumeAutopilot();
    assert.equal(resumed.paused, false);

    const loaded = await loadAutopilotPolicy();
    assert.equal(loaded.mode, "automatic");
  });

  it("builds autopilot performance from execution and pipeline inputs", () => {
    const performance = buildAutopilotPerformance({
      autopilotSnapshot: emptySnapshot(),
      executionSnapshot: emptyExecutionSnapshot(),
      priorCriticalTerritories: 2,
    });

    assert.equal(performance.recommendationsGenerated, 1);
    assert.equal(performance.postingSuccessRate, 100);
    assert.equal(performance.hiringSuccessRate, 100);
    assert.equal(performance.timeToFillDays, 12);
  });

  it("builds recommendation feedback without duplicate analytics store", async () => {
    const feedback = buildRecommendationFeedback({
      correlations: emptyExecutionSnapshot().executionQueue,
      applicantPerformance: emptyExecutionSnapshot().applicantPerformance,
      fetchedAt: "2026-06-23T12:00:00.000Z",
    });

    assert.ok(feedback.rows.length > 0);
    assert.ok(feedback.topPerforming.length > 0);
    assert.equal("auditTrail" in feedback, false);

    await writeFile(FEEDBACK_PATH, JSON.stringify({ territoryWeights: feedback.territoryWeights, typeWeights: feedback.typeWeights, updatedAt: new Date().toISOString() }));
    const raw = JSON.parse(await readFile(FEEDBACK_PATH, "utf8")) as Record<string, unknown>;
    assert.ok(raw.territoryWeights);
    assert.equal("correlations" in raw, false);
  });

  it("applies feedback priority boosts into P57 posting recommendations", () => {
    const ads = applyRecommendationFeedbackToAds(emptySnapshot().postingRecommendations, {
      territoryWeights: { "Texas DM": 80 },
      typeWeights: { "create-new-ad": 85 },
    });

    assert.equal(ads[0]!.priority, "high");
    assert.equal(ads[0]!.approvalStatus, "auto-approved");
    assert.match(ads[0]!.reason, /P59 feedback/);
  });

  it("resolveAutopilotAutonomy enforces manual, semi-automatic, automatic, and pause", async () => {
    await saveAutopilotPolicy({ mode: "manual", paused: false, updatedAt: new Date().toISOString() });
    assert.deepEqual(resolveAutopilotAutonomy({ mode: "manual", paused: false, updatedAt: "" }), {
      shouldAutoApprove: false,
      shouldAutoExecute: false,
    });

    assert.deepEqual(
      resolveAutopilotAutonomy({ mode: "semi-automatic", paused: false, updatedAt: "" }),
      { shouldAutoApprove: true, shouldAutoExecute: false },
    );

    assert.deepEqual(
      resolveAutopilotAutonomy({ mode: "automatic", paused: false, updatedAt: "" }),
      { shouldAutoApprove: true, shouldAutoExecute: true },
    );

    assert.deepEqual(
      resolveAutopilotAutonomy({ mode: "automatic", paused: true, updatedAt: "" }),
      { shouldAutoApprove: false, shouldAutoExecute: false },
    );
  });

  it("executeEligibleRecommendations blocks auto-execution unless enabled", async () => {
    const blocked = await executeEligibleRecommendations({
      snapshot: emptySnapshot(),
      autoExecute: false,
    });
    assert.equal(blocked.executed, 0);
    assert.equal(blocked.failed, 0);
  });

  it("system approval records accountability with source, rule, and timestamp", async () => {
    await writeFile(CORRELATION_PATH, JSON.stringify({ correlations: [], updatedAt: new Date().toISOString() }));
    await writeFile(
      ACCOUNTABILITY_PATH,
      JSON.stringify({ actions: [], forecastHistory: [], auditLog: [], updatedAt: new Date().toISOString() }),
    );

    const snapshot = emptySnapshot();
    const planned = await planCorrelationsFromSnapshot(snapshot);
    const posting = planned.find((row) => row.type === "posting");
    assert.ok(posting);

    const approved = await approveCorrelationWithP59Accountability(
      posting!.id,
      "rule-coverage-auto-post",
      "Auto-approve urgent posting",
    );
    assert.ok(approved?.accountabilityActionId);

    const accountability = JSON.parse(await readFile(ACCOUNTABILITY_PATH, "utf8")) as {
      actions: { recommendationId: string; sourceModule: string; notes: string[] }[];
      auditLog: { field: string; newValue: string | null; changedAt: string }[];
    };

    const action = accountability.actions.find(
      (row) => row.recommendationId === approved!.accountabilityActionId,
    );
    assert.equal(action?.sourceModule, "autonomous-recruiting-autopilot");
    assert.ok(action?.notes.some((note) => note.includes("Approval source: system")));
    assert.ok(action?.notes.some((note) => note.includes("rule-coverage-auto-post")));

    const audit = accountability.auditLog.find((row) => row.field === "auto_approved");
    assert.ok(audit?.changedAt);
    assert.equal(audit?.newValue, "rule-coverage-auto-post");
  });

  it("persists only policy, run history, and feedback weights in P59 stores", async () => {
    const policyRaw = JSON.parse(await readFile(POLICY_PATH, "utf8")) as Record<string, unknown>;
    const runsRaw = JSON.parse(await readFile(RUNS_PATH, "utf8")) as Record<string, unknown>;
    const feedbackRaw = JSON.parse(await readFile(FEEDBACK_PATH, "utf8")) as Record<string, unknown>;

    assert.ok(policyRaw.policy);
    assert.ok(Array.isArray(runsRaw.runs));
    assert.ok(feedbackRaw.territoryWeights);
    assert.equal("correlations" in policyRaw, false);
    assert.equal("auditTrail" in runsRaw, false);
    assert.equal("actions" in feedbackRaw, false);
  });

  it("does not create parallel execution or task stores", async () => {
    await setAutopilotMode("semi-automatic");
    let legacyExecutions = false;
    let legacyTasks = false;
    try {
      await readFile(LEGACY_EXECUTIONS_PATH, "utf8");
      legacyExecutions = true;
    } catch {
      legacyExecutions = false;
    }
    try {
      await readFile(LEGACY_TASKS_PATH, "utf8");
      legacyTasks = true;
    } catch {
      legacyTasks = false;
    }
    assert.equal(legacyExecutions, false);
    assert.equal(legacyTasks, false);
  });
});
