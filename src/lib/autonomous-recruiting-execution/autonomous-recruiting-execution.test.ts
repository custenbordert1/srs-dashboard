import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import { approveCorrelationWithAccountability } from "@/lib/autonomous-recruiting-execution/bridge-accountability";
import { executePostingCorrelation, mapRecommendedAdToExecutionPayload } from "@/lib/autonomous-recruiting-execution/bridge-posting";
import { buildApplicantMonitoring } from "@/lib/autonomous-recruiting-execution/build-applicant-monitoring";
import { buildExecutionOutcomes } from "@/lib/autonomous-recruiting-execution/build-execution-outcomes";
import { buildRecruiterTaskView } from "@/lib/autonomous-recruiting-execution/build-recruiter-task-view";
import { buildRefreshRecommendations } from "@/lib/autonomous-recruiting-execution/build-refresh-recommendations";
import {
  approveCorrelation,
  listCorrelations,
  planCorrelationsFromSnapshot,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";

const DATA_DIR = path.join(process.cwd(), ".data");
const CORRELATION_PATH = path.join(DATA_DIR, "autopilot-execution-correlation.json");
const LEGACY_TASKS_PATH = path.join(DATA_DIR, "autopilot-recruiter-tasks.json");
const LEGACY_EXECUTIONS_PATH = path.join(DATA_DIR, "autopilot-executions.json");
const ACCOUNTABILITY_PATH = path.join(DATA_DIR, "executive-accountability.json");
const JOB_DRAFTS_PATH = path.join(DATA_DIR, "job-drafts.json");
const AUTOMATION_RUNS_PATH = path.join(DATA_DIR, "hiring-automation-runs.json");

function emptySnapshot(patch: Partial<AutonomousRecruitingSnapshot> = {}): AutonomousRecruitingSnapshot {
  return {
    fetchedAt: "2026-06-23T12:00:00.000Z",
    territoryStates: ["TX"],
    kpis: {
      coverageNeedsDetected: 1,
      adsRecommended: 1,
      adsAutoApproved: 0,
      candidatesRecommendedForHire: 0,
      estimatedHoursSaved: 0,
      hoursSavedFormula: "",
    },
    pipelineFlow: [],
    coverageNeeds: [
      {
        territoryKey: "dm-tx:TX",
        territoryLabel: "Texas DM",
        dmName: "Taylor",
        states: ["TX"],
        openCalls: 3,
        activeReps: 2,
        pipelineCandidates: 1,
        applicantCount: 2,
        coverageStatus: "Critical",
        coverageNeedScore: 85,
        drivers: ["open calls"],
        recommendedAction: "Post new ad",
      },
    ],
    postingRecommendations: [
      {
        id: "ad-create-new-ad-job-1",
        title: "Merchandiser — Dallas",
        city: "Dallas",
        state: "TX",
        territory: "Texas DM",
        reason: "Coverage gap",
        expectedApplicants: { min: 3, max: 8 },
        priority: "high",
        approvalStatus: "pending",
        adType: "create-new-ad",
        positionId: "job-1",
      },
    ],
    hiringRecommendations: [
      {
        candidateId: "cand-1",
        candidateName: "Sam Rivera",
        positionName: "Merchandiser",
        city: "Dallas",
        state: "TX",
        territory: "Texas DM",
        recommendedAction: "Hire Now",
        grade: "A",
        confidence: "high",
        coverageContext: "Critical coverage",
        reasons: ["Strong fit"],
      },
      {
        candidateId: "cand-2",
        candidateName: "Alex Lee",
        positionName: "Merchandiser",
        city: "Dallas",
        state: "TX",
        territory: "Texas DM",
        recommendedAction: "Reject",
        grade: "D",
        confidence: "high",
        coverageContext: "N/A",
        reasons: ["Not qualified"],
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
    ...patch,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

before(async () => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    CORRELATION_PATH,
    JSON.stringify({ correlations: [], updatedAt: new Date().toISOString() }),
  );
  await writeFile(
    ACCOUNTABILITY_PATH,
    JSON.stringify({ actions: [], forecastHistory: [], auditLog: [], updatedAt: new Date().toISOString() }),
  );
  await writeFile(JOB_DRAFTS_PATH, JSON.stringify({ drafts: [], updatedAt: new Date().toISOString() }));
  await writeFile(AUTOMATION_RUNS_PATH, JSON.stringify({ runs: [], updatedAt: new Date().toISOString() }));
  await rm(LEGACY_TASKS_PATH, { force: true });
  await rm(LEGACY_EXECUTIONS_PATH, { force: true });
});

after(async () => {
  await rm(CORRELATION_PATH, { force: true });
  await rm(LEGACY_TASKS_PATH, { force: true });
  await rm(LEGACY_EXECUTIONS_PATH, { force: true });
});

describe("autonomous-recruiting-execution orchestration", () => {
  it("plans correlations from autopilot snapshot with dedupe", async () => {
    const snapshot = emptySnapshot();
    const first = await planCorrelationsFromSnapshot(snapshot);
    const second = await planCorrelationsFromSnapshot(snapshot);

    assert.ok(first.length >= 3);
    assert.equal(first.length, second.length);
    assert.ok(first.some((row) => row.type === "posting"));
    assert.ok(first.some((row) => row.type === "hiring"));
    assert.ok(first.some((row) => row.type === "coverage"));
    assert.ok(!first.some((row) => row.candidateId === "cand-2"));
  });

  it("does not write parallel recruiter task or execution stores", async () => {
    const snapshot = emptySnapshot();
    await planCorrelationsFromSnapshot(snapshot);
    await buildRecruiterTaskView({ scoredRows: [] });

    assert.equal(await pathExists(LEGACY_TASKS_PATH), false);
    assert.equal(await pathExists(LEGACY_EXECUTIONS_PATH), false);
  });

  it("stores correlations without auditTrail field", async () => {
    await planCorrelationsFromSnapshot(emptySnapshot());
    const raw = JSON.parse(await readFile(CORRELATION_PATH, "utf8")) as {
      correlations: Record<string, unknown>[];
    };

    assert.ok(raw.correlations.length > 0);
    for (const row of raw.correlations) {
      assert.equal("auditTrail" in row, false);
      assert.equal("payload" in row, false);
    }
  });

  it("approves via executive accountability bridge", async () => {
    const planned = await planCorrelationsFromSnapshot(emptySnapshot());
    const posting = planned.find((row) => row.type === "posting");
    assert.ok(posting);

    const approved = await approveCorrelationWithAccountability(posting!.id, { displayName: "exec-user" });
    assert.equal(approved?.status, "approved");
    assert.ok(approved?.accountabilityActionId);

    const accountability = JSON.parse(await readFile(ACCOUNTABILITY_PATH, "utf8")) as {
      actions: { sourceModule: string; recommendationId: string }[];
    };
    assert.ok(
      accountability.actions.some(
        (row) =>
          row.sourceModule === "autonomous-recruiting-execution" &&
          row.recommendationId === approved!.accountabilityActionId,
      ),
    );
  });

  it("delegates posting execution to job-draft-store", async () => {
    const planned = await planCorrelationsFromSnapshot(emptySnapshot());
    const posting = planned.find((row) => row.type === "posting");
    assert.ok(posting);

    await approveCorrelation(posting!.id, "exec-user");
    const result = await executePostingCorrelation(posting!.id, "exec-user");
    assert.equal(result.ok, true);
    assert.ok(result.correlation?.jobDraftId);

    const drafts = JSON.parse(await readFile(JOB_DRAFTS_PATH, "utf8")) as {
      drafts: { id: string }[];
    };
    assert.ok(drafts.drafts.some((row) => row.id === result.correlation?.jobDraftId));
  });

  it("maps recommended ad payload for execution", () => {
    const snapshot = emptySnapshot();
    const ad = snapshot.postingRecommendations[0]!;
    const payload = mapRecommendedAdToExecutionPayload(ad);
    assert.equal(payload.adType, "create-new-ad");
    assert.equal(payload.title, ad.title);
    assert.equal(payload.positionId, "job-1");
  });

  it("builds recruiter task view from hiring funnel without persistence", async () => {
    const tasks = buildRecruiterTaskView({ scoredRows: [] });
    assert.ok(Array.isArray(tasks));
    assert.equal(await pathExists(LEGACY_TASKS_PATH), false);
  });

  it("builds applicant monitoring with alerts for low applicants", () => {
    const snapshot = emptySnapshot();
    const rows = buildApplicantMonitoring({
      coverageNeeds: snapshot.coverageNeeds,
      scoredRows: [],
      jobs: [],
      fetchedAt: snapshot.fetchedAt,
    });

    assert.equal(rows.length, 1);
    assert.ok(rows[0]!.alerts.length > 0);
    assert.ok(rows[0]!.timeToFillDays !== null);
  });

  it("builds refresh correlations when applicants below target", () => {
    const snapshot = emptySnapshot();
    const applicantPerformance = buildApplicantMonitoring({
      coverageNeeds: snapshot.coverageNeeds,
      scoredRows: [],
      jobs: [],
      fetchedAt: snapshot.fetchedAt,
    });

    const { refreshAds, refreshCorrelations } = buildRefreshRecommendations({
      postingRecommendations: snapshot.postingRecommendations,
      coverageNeeds: snapshot.coverageNeeds,
      applicantPerformance,
      existingCorrelations: [],
    });

    assert.ok(refreshAds.length > 0);
    assert.ok(refreshCorrelations.length > 0);
    assert.equal(refreshCorrelations[0]!.adType, "refresh-ad");
    assert.equal("auditTrail" in refreshCorrelations[0]!, false);
  });

  it("computes execution outcomes from correlation counts", () => {
    const outcomes = buildExecutionOutcomes({
      correlations: [
        {
          id: "e1",
          recommendationId: "ad-1",
          territory: "Texas DM",
          type: "posting",
          priority: "high",
          createdAt: "2026-06-23T12:00:00.000Z",
          status: "completed",
          adType: "create-new-ad",
          completedAt: "2026-06-23T12:30:00.000Z",
        },
      ],
      coverageNeeds: emptySnapshot().coverageNeeds,
      applicantPerformance: buildApplicantMonitoring({
        coverageNeeds: emptySnapshot().coverageNeeds,
        scoredRows: [],
        jobs: [],
        fetchedAt: "2026-06-23T12:00:00.000Z",
      }),
    });

    assert.ok(outcomes.some((row) => row.id === "posting-success-rate"));
    assert.ok(outcomes.some((row) => row.id === "time-saved"));
    const timeSaved = outcomes.find((row) => row.id === "time-saved");
    assert.equal(typeof timeSaved?.value, "number");
    assert.ok((timeSaved?.value as number) > 0);
  });

  it("preserves recruiter oversight — reject hiring stays recommendation-only", async () => {
    const planned = await planCorrelationsFromSnapshot(emptySnapshot());
    const rejectCorrelation = planned.find((row) => row.candidateId === "cand-2");
    assert.equal(rejectCorrelation, undefined);
    assert.equal((await listCorrelations()).filter((row) => row.candidateId === "cand-2").length, 0);
  });
});
