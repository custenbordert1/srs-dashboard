import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { applyCandidateExecutions, retryEligibleExecution } from "@/lib/candidate-automation-execution/apply-candidate-executions";
import { buildExecutionDecisions } from "@/lib/candidate-automation-execution/build-execution-decisions";
import { buildCandidateExecutionHealth } from "@/lib/candidate-automation-execution/build-execution-health";
import {
  DEFAULT_CANDIDATE_EXECUTION_POLICY,
  loadCandidateExecutionPolicy,
  saveCandidateExecutionPolicy,
} from "@/lib/candidate-automation-execution/execution-policy-store";
import {
  listCandidateExecutions,
  recordCandidateExecution,
} from "@/lib/candidate-automation-execution/execution-record-store";
import {
  installIsolatedRecruitingDataDir,
  recruitingStorePath,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

let isolation: IsolatedRecruitingDataHandle;

function candidate(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-20T10:00:00.000Z",
    createdDate: "2026-06-20T10:00:00.000Z",
    addedDate: "2026-06-20T10:00:00.000Z",
    updatedDate: "2026-06-20T10:00:00.000Z",
    addedDateSource: "creation_date",
    positionName: "Merchandiser",
    positionId: "pos-1",
    city: "Atlanta",
    state: "GA",
    zipCode: "30301",
    hasResume: true,
    resumeText: "Retail merchandising",
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: "Applied",
    assignedRecruiter: "Taylor",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkSignedAt: null,
    paperworkError: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    requiredAction: patch.requiredAction ?? "Follow Up",
    actionType: patch.actionType ?? "follow-up",
    actionPriority: "medium",
    actionReason: "Test action",
    actionDueDate: patch.actionDueDate ?? "2026-06-01",
    actionConfidence: 80,
    actionGeneratedAt: patch.actionGeneratedAt ?? "2026-06-20T12:00:00.000Z",
    ...patch,
  };
}

before(async () => {
  isolation = await installIsolatedRecruitingDataDir("p65-execution-test-");
});

after(async () => {
  await isolation.restore();
});

describe("candidate-automation-execution", () => {
  it("defaults execution policy disabled semi-automatic with safety caps", async () => {
    const policy = await loadCandidateExecutionPolicy();
    assert.equal(policy.enabled, false);
    assert.equal(policy.mode, "semi-automatic");
    assert.equal(policy.paperwork.enabled, true);
    assert.equal(policy.escalation.enabled, true);
    assert.equal(policy.escalation.requireApproval, true);
    assert.equal(policy.maxRetries, 3);
    assert.equal(policy.escalationDelayHours, 48);
    assert.equal(policy.maxEscalationsPerRun, 10);
    assert.equal(policy.dryRun, false);
  });

  it("persists execution records with lifecycle fields", async () => {
    await recordCandidateExecution({
      executionId: "exec-1",
      candidateId: "c-1",
      executionType: "schedule-recruiter-follow-up",
      status: "failed",
      createdAt: "2026-06-20T10:00:00.000Z",
      failedAt: "2026-06-20T10:05:00.000Z",
      retryCount: 1,
      failureReason: "Simulated failure",
    });

    const records = await listCandidateExecutions(5);
    assert.equal(records[0]?.executionId, "exec-1");
    assert.equal(records[0]?.retryCount, 1);

    const raw = await readFile(
      recruitingStorePath("candidate-automation-execution-records.json"),
      "utf8",
    );
    assert.match(raw, /exec-1/);
  });

  it("maps orchestrator actions to execution decisions", () => {
    const row = buildScoredWorkflowRow(candidate("c-1"), workflow("c-1"));
    const decisions = buildExecutionDecisions({
      candidates: [row],
      escalationDelayHours: 48,
    });
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]?.executionType, "create-escalation-task");
    assert.equal(decisions[0]?.stalled, true);
  });

  it("executes follow-up scheduling without duplicate records", async () => {
    const row = buildScoredWorkflowRow(
      candidate("c-2"),
      workflow("c-2", {
        actionType: "follow-up",
        actionDueDate: "2099-01-01",
        requiredAction: "Follow Up",
      }),
    );
    const decisions = buildExecutionDecisions({
      candidates: [row],
      escalationDelayHours: 48,
    });
    const candidatesById = new Map([[row.candidateId, row]]);

    const activePolicy = { ...DEFAULT_CANDIDATE_EXECUTION_POLICY, enabled: true };
    const first = await applyCandidateExecutions({
      decisions,
      candidatesById,
      policy: activePolicy,
      automationMode: "semi-automatic",
    });
    const second = await applyCandidateExecutions({
      decisions,
      candidatesById,
      policy: activePolicy,
      automationMode: "semi-automatic",
    });

    assert.equal(first.completed, 1);
    assert.equal(second.skipped, 1);
    const forCandidate = (await listCandidateExecutions(50)).filter((row) => row.candidateId === "c-2");
    assert.equal(forCandidate.length, 1);
  });

  it("skips execution when policy disabled", async () => {
    const row = buildScoredWorkflowRow(candidate("c-3"), workflow("c-3", { actionDueDate: "2099-01-01" }));
    const result = await applyCandidateExecutions({
      decisions: buildExecutionDecisions({ candidates: [row], escalationDelayHours: 48 }),
      candidatesById: new Map([[row.candidateId, row]]),
      policy: { ...DEFAULT_CANDIDATE_EXECUTION_POLICY, enabled: false },
      automationMode: "automatic",
    });
    assert.equal(result.blockedByPolicy, 1);
    assert.equal(result.completed, 0);
  });

  it("dry run reports eligible without executing", async () => {
    const row = buildScoredWorkflowRow(
      candidate("c-dry"),
      workflow("c-dry", { actionDueDate: "2099-01-01", actionType: "follow-up" }),
    );
    const result = await applyCandidateExecutions({
      decisions: buildExecutionDecisions({ candidates: [row], escalationDelayHours: 48 }),
      candidatesById: new Map([[row.candidateId, row]]),
      policy: { ...DEFAULT_CANDIDATE_EXECUTION_POLICY, enabled: true, dryRun: true },
      automationMode: "semi-automatic",
    });
    assert.equal(result.dryRun, true);
    assert.equal(result.completed, 0);
    assert.equal(result.eligibleExecutions, 1);
  });

  it("blocks escalations beyond maxEscalationsPerRun", async () => {
    const rows = ["c-a", "c-b", "c-c"].map((id) =>
      buildScoredWorkflowRow(candidate(id), workflow(id)),
    );
    const decisions = buildExecutionDecisions({ candidates: rows, escalationDelayHours: 48 });
    const result = await applyCandidateExecutions({
      decisions,
      candidatesById: new Map(rows.map((row) => [row.candidateId, row])),
      policy: {
        ...DEFAULT_CANDIDATE_EXECUTION_POLICY,
        enabled: true,
        maxEscalationsPerRun: 1,
      },
      automationMode: "automatic",
    });
    assert.ok(result.blockedByBatchCap >= 1);
  });

  it("retries failed executions up to maxRetries", async () => {
    await recordCandidateExecution({
      executionId: "exec-retry",
      candidateId: "c-4",
      executionType: "schedule-recruiter-follow-up",
      status: "failed",
      createdAt: "2026-06-20T10:00:00.000Z",
      failedAt: "2026-06-20T10:05:00.000Z",
      retryCount: 0,
      failureReason: "Transient",
      actionType: "follow-up",
      requiredAction: "Follow Up",
    });

    const row = buildScoredWorkflowRow(
      candidate("c-4"),
      workflow("c-4", { actionDueDate: "2099-01-01", actionType: "follow-up" }),
    );
    const retried = await retryEligibleExecution({
      executionId: "exec-retry",
      policy: { ...DEFAULT_CANDIDATE_EXECUTION_POLICY, enabled: true },
      candidatesById: new Map([[row.candidateId, row]]),
      automationMode: "automatic",
    });

    assert.equal(retried?.status, "completed");
    assert.equal(retried?.retryCount, 1);
  });

  it("builds execution health metrics", async () => {
    await saveCandidateExecutionPolicy(DEFAULT_CANDIDATE_EXECUTION_POLICY);
    const health = await buildCandidateExecutionHealth();
    assert.equal(typeof health.executionsToday, "number");
    assert.equal(typeof health.successRatePct, "number");
    assert.equal(typeof health.eligibleExecutions, "number");
    assert.equal(typeof health.blockedByPolicy, "number");
    assert.equal(typeof health.blockedByBatchCap, "number");
  });
});
