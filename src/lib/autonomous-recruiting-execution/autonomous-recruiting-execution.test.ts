import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import { buildApplicantMonitoring } from "@/lib/autonomous-recruiting-execution/build-applicant-monitoring";
import { buildExecutionOutcomes } from "@/lib/autonomous-recruiting-execution/build-execution-outcomes";
import { buildRecruiterExecutionTasks } from "@/lib/autonomous-recruiting-execution/build-recruiter-execution-tasks";
import { buildRefreshRecommendations } from "@/lib/autonomous-recruiting-execution/build-refresh-recommendations";
import {
  approveExecution,
  completeExecution,
  listExecutions,
  planExecutionsFromSnapshot,
} from "@/lib/autonomous-recruiting-execution/execution-store";
import { mapRecommendedAdToExecutionPayload } from "@/lib/autonomous-recruiting-execution/execute-posting-recommendation";
import { completeTask, listRecruiterTasks, upsertRecruiterTasks } from "@/lib/autonomous-recruiting-execution/recruiter-task-store";

const DATA_DIR = path.join(process.cwd(), ".data");
const EXECUTIONS_PATH = path.join(DATA_DIR, "autopilot-executions.json");
const TASKS_PATH = path.join(DATA_DIR, "autopilot-recruiter-tasks.json");

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

before(async () => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(EXECUTIONS_PATH, JSON.stringify({ executions: [], updatedAt: new Date().toISOString() }));
  await writeFile(TASKS_PATH, JSON.stringify({ tasks: [], updatedAt: new Date().toISOString() }));
});

after(async () => {
  await rm(EXECUTIONS_PATH, { force: true });
  await rm(TASKS_PATH, { force: true });
});

describe("autonomous-recruiting-execution", () => {
  it("plans executions from autopilot snapshot with dedupe", async () => {
    const snapshot = emptySnapshot();
    const first = await planExecutionsFromSnapshot(snapshot);
    const second = await planExecutionsFromSnapshot(snapshot);

    assert.ok(first.length >= 3);
    assert.equal(first.length, second.length);
    assert.ok(first.some((row) => row.type === "posting"));
    assert.ok(first.some((row) => row.type === "hiring"));
    assert.ok(first.some((row) => row.type === "coverage"));
    assert.ok(!first.some((row) => row.payload.candidateId === "cand-2"));
  });

  it("dedupes by recommendationId across plan calls", async () => {
    const snapshot = emptySnapshot();
    await planExecutionsFromSnapshot(snapshot);
    const beforeCount = (await listExecutions()).length;
    await planExecutionsFromSnapshot(snapshot);
    const afterCount = (await listExecutions()).length;
    assert.equal(beforeCount, afterCount);
  });

  it("approves and completes posting execution lifecycle", async () => {
    const snapshot = emptySnapshot();
    const planned = await planExecutionsFromSnapshot(snapshot);
    const posting = planned.find((row) => row.type === "posting");
    assert.ok(posting);

    const approved = await approveExecution(posting!.id, "exec-user");
    assert.equal(approved?.status, "approved");

    const completed = await completeExecution(
      posting!.id,
      { summary: "Draft created", success: true, linkedResourceType: "job-draft", linkedResourceId: "draft-1" },
      "exec-user",
    );
    assert.equal(completed?.status, "completed");
    assert.equal(completed?.linkedJobDraftId, "draft-1");
  });

  it("maps recommended ad payload for execution", () => {
    const snapshot = emptySnapshot();
    const ad = snapshot.postingRecommendations[0]!;
    const payload = mapRecommendedAdToExecutionPayload(ad);
    assert.equal(payload.adType, "create-new-ad");
    assert.equal(payload.title, ad.title);
    assert.equal(payload.positionId, "job-1");
  });

  it("builds recruiter execution tasks excluding reject recommendations", () => {
    const snapshot = emptySnapshot();
    const tasks = buildRecruiterExecutionTasks({
      hiringRecommendations: snapshot.hiringRecommendations,
      coverageNeeds: snapshot.coverageNeeds,
      scoredRows: [],
      executions: [],
    });

    assert.ok(tasks.some((task) => task.candidateId === "cand-1"));
    assert.ok(!tasks.some((task) => task.candidateId === "cand-2"));
    assert.ok(tasks.some((task) => task.label.includes("Critical coverage")));
  });

  it("upserts and completes recruiter tasks", async () => {
    await upsertRecruiterTasks([
      {
        id: "task-1",
        label: "Interview candidate",
        owner: "Taylor",
        priority: "high",
        dueDate: new Date().toISOString(),
        candidateId: "cand-1",
        territory: "Texas DM",
      },
    ]);

    const tasks = await listRecruiterTasks();
    assert.equal(tasks.length, 1);

    const completed = await completeTask("task-1");
    assert.equal(completed?.status, "completed");
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

  it("builds refresh recommendations when applicants below target", () => {
    const snapshot = emptySnapshot();
    const applicantPerformance = buildApplicantMonitoring({
      coverageNeeds: snapshot.coverageNeeds,
      scoredRows: [],
      jobs: [],
      fetchedAt: snapshot.fetchedAt,
    });

    const { refreshAds, refreshExecutions } = buildRefreshRecommendations({
      postingRecommendations: snapshot.postingRecommendations,
      coverageNeeds: snapshot.coverageNeeds,
      applicantPerformance,
      existingExecutions: [],
    });

    assert.ok(refreshAds.length > 0);
    assert.ok(refreshExecutions.length > 0);
    assert.equal(refreshExecutions[0]!.payload.adType, "refresh-ad");
  });

  it("computes execution outcomes from real execution counts", () => {
    const outcomes = buildExecutionOutcomes({
      executions: [
        {
          id: "e1",
          recommendationId: "ad-1",
          territory: "Texas DM",
          type: "posting",
          priority: "high",
          createdAt: "2026-06-23T12:00:00.000Z",
          status: "completed",
          payload: { adType: "create-new-ad" },
          auditTrail: [],
          outcome: { summary: "ok", success: true },
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

  it("tracks refreshCount in refresh execution payload", () => {
    const snapshot = emptySnapshot();
    const applicantPerformance = buildApplicantMonitoring({
      coverageNeeds: snapshot.coverageNeeds,
      scoredRows: [],
      jobs: [],
      fetchedAt: snapshot.fetchedAt,
    });

    const first = buildRefreshRecommendations({
      postingRecommendations: snapshot.postingRecommendations,
      coverageNeeds: snapshot.coverageNeeds,
      applicantPerformance,
      existingExecutions: [],
    });

    const second = buildRefreshRecommendations({
      postingRecommendations: snapshot.postingRecommendations,
      coverageNeeds: snapshot.coverageNeeds,
      applicantPerformance,
      existingExecutions: first.refreshExecutions,
    });

    assert.equal(first.refreshExecutions[0]!.payload.refreshCount, 1);
    assert.ok((second.refreshExecutions[0]!.payload.refreshCount ?? 0) >= 1);
  });

  it("preserves recruiter oversight — reject hiring stays recommendation-only", async () => {
    const snapshot = emptySnapshot();
    const planned = await planExecutionsFromSnapshot(snapshot);
    const rejectExecution = planned.find((row) => row.payload.candidateId === "cand-2");
    assert.equal(rejectExecution, undefined);
  });
});
