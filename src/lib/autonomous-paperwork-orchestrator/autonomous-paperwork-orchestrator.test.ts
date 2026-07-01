import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { evaluateCandidateEligibility } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { evaluateApprovalDecision } from "@/lib/autonomous-paperwork-orchestrator/evaluate-approvals";
import {
  buildOrchestratorCandidateRecord,
  buildSendQueue,
  compareQueuePriority,
} from "@/lib/autonomous-paperwork-orchestrator/build-send-queue";
import {
  isRetryablePaperworkError,
  nextRetryDelayMs,
  shouldRetryPaperworkSend,
} from "@/lib/autonomous-paperwork-orchestrator/retry-engine";
import { createOperatorTimeline, formatOperatorTimeline } from "@/lib/autonomous-paperwork-orchestrator/operator-timeline";
import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import { buildProductionReadinessReport } from "@/lib/autonomous-paperwork-orchestrator/build-production-readiness-report";
import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";

const envBackup: Record<string, string | undefined> = {};
let tempDir = "";

function setEnv(key: string, value: string | undefined): void {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function restoreEnv(): Promise<void> {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
}

function baseRow(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Pilot",
    email: "alex@example.com",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    assignedRecruiter: "Taylor",
    assignedDM: "Melissa",
    stage: "Applied",
    hasResume: true,
    candidateGrade: { paperworkReady: true },
    paperworkTemplateKey: "onboarding_packet",
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function emptyContext(candidateId: string, row: ScoredCandidateWorkflowRow | null): LoadedPaperworkCandidates {
  const publishedJob = {
    jobId: "job-1",
    name: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    displayLocation: "Dallas, TX",
    locationSource: "breezy",
    status: "published",
    createdDate: "",
    updatedDate: "",
  } as const;
  return {
    rowsByCandidateId: row ? new Map([[candidateId, row]]) : new Map(),
    jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
    closedJobsByPositionId: new Map(),
    publishedJobs: [publishedJob],
    publishedJobTitleById: new Map([[publishedJob.jobId, publishedJob.name]]),
    onboardingByCandidateId: new Map(),
    p109ByCandidate: new Map(),
    approvedMappingsByCandidate: new Map(),
    p100SentIds: new Set(),
    pilotSentIds: new Set(),
    candidateIds: [candidateId],
  };
}

describe("autonomous-paperwork-orchestrator (P123)", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("classifies eligibility into exactly one status", () => {
    const ready = evaluateCandidateEligibility({
      candidateId: "c1",
      row: baseRow(),
      context: emptyContext("c1", baseRow()),
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      approvedMapping: null,
    });
    assert.equal(ready.status, "READY_TO_SEND");

    const invalid = evaluateCandidateEligibility({
      candidateId: "c2",
      row: baseRow({ candidateId: "c2", email: "bad" }),
      context: emptyContext("c2", baseRow({ candidateId: "c2", email: "bad" })),
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      approvedMapping: null,
    });
    assert.equal(invalid.status, "INVALID_EMAIL");

    const sent = evaluateCandidateEligibility({
      candidateId: "c3",
      row: baseRow({ candidateId: "c3", paperworkStatus: "sent", signatureRequestId: "sig-1" }),
      context: emptyContext("c3", baseRow({ candidateId: "c3", paperworkStatus: "sent", signatureRequestId: "sig-1" })),
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      approvedMapping: null,
    });
    assert.equal(sent.status, "WAITING_SIGNATURE");
  });

  it("orders queue by priority score", () => {
    const high = buildOrchestratorCandidateRecord({
      candidateId: "high",
      candidateName: "High",
      email: "h@example.com",
      positionId: "job-1",
      positionTitle: "Merch",
      recruiter: "Taylor",
      dm: "Melissa",
      eligibilityStatus: "READY_TO_SEND",
      requiredAction: "Send",
      blockingReasons: [],
      templateKey: "onboarding_packet",
      mappingConfidence: 90,
      approvedMappingReady: false,
      onPilotAllowlist: true,
      approvedForQueue: true,
      manualPriorityOverride: 2,
    });
    const low = buildOrchestratorCandidateRecord({
      candidateId: "low",
      candidateName: "Low",
      email: "l@example.com",
      positionId: "job-1",
      positionTitle: "Merch",
      recruiter: "Taylor",
      dm: "Melissa",
      eligibilityStatus: "READY_AFTER_APPROVAL",
      requiredAction: "Send",
      blockingReasons: [],
      templateKey: "onboarding_packet",
      mappingConfidence: 40,
      approvedMappingReady: true,
      onPilotAllowlist: true,
      approvedForQueue: true,
      manualPriorityOverride: 0,
    });
    const queue = buildSendQueue([low, high]);
    assert.equal(queue.nextCandidate?.candidateId, "high");
    assert.equal(compareQueuePriority(high, low) > 0, true);
    assert.ok(queue.estimatedCompletionMinutes > 0);
  });

  it("retries only transient errors", () => {
    assert.equal(isRetryablePaperworkError("Request timed out after 10s"), true);
    assert.equal(isRetryablePaperworkError("Duplicate send blocked"), false);
    assert.equal(shouldRetryPaperworkSend({ error: "network failure", eligibilityStatus: "READY_TO_SEND", attempt: 0 }), true);
    assert.equal(
      shouldRetryPaperworkSend({ error: "already sent", eligibilityStatus: "ALREADY_SENT", attempt: 0 }),
      false,
    );
    assert.equal(nextRetryDelayMs(0), 5_000);
    assert.equal(nextRetryDelayMs(2), 45_000);
  });

  it("approval gating requires pilot allowlist", () => {
    const blocked = evaluateApprovalDecision({
      context: emptyContext("c1", baseRow()),
      candidateId: "c1",
      eligibilityStatus: "READY_TO_SEND",
      approvedMappingReady: false,
      onPilotAllowlist: false,
    });
    assert.equal(blocked.approvedForQueue, false);

    const approved = evaluateApprovalDecision({
      context: emptyContext("c1", baseRow()),
      candidateId: "c1",
      eligibilityStatus: "READY_TO_SEND",
      approvedMappingReady: false,
      onPilotAllowlist: true,
    });
    assert.equal(approved.approvedForQueue, true);
  });

  it("default cycle sends nothing and never calls executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p123-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST", "");

    let executeBatchCalls = 0;
    let executeOneCalls = 0;
    const result = await runPaperworkCycle({
      dryRun: true,
      runPilotSend: (async (input) => {
        if ((input as { dryRun?: boolean }).dryRun === false) executeOneCalls += 1;
        return {
          report: {} as never,
          sendPacketPreview: null,
          sendResult: {
            executedAt: new Date().toISOString(),
            candidateId: "",
            candidateName: "",
            outcome: "not_executed",
            signatureRequestId: null,
            error: null,
            mode: "dryRun",
          },
          executedMode: "dryRun",
          executeBatchCalled: false,
        };
      }) as never,
    });

    assert.equal(result.executeBatchCalled, false);
    assert.equal(executeOneCalls, 0);
    assert.equal(executeBatchCalls, 0);
    assert.equal(result.report.execution.mode, "dryRun");
    assert.equal(result.report.execution.outcome, "not_executed");
  });

  it("executeOne integration is called at most once when executing", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p123-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "true");
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "true");
    setEnv("AUTONOMOUS_PAPERWORK_OPERATOR_GO", "true");
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST", "c1");

    let executeOneCalls = 0;
    const row = baseRow();
    const context = emptyContext("c1", row);

    const result = await runPaperworkCycle({
      execute: true,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
      candidateId: "c1",
      contextOverride: context,
      runPilotSend: (async () => {
        executeOneCalls += 1;
        return {
          report: {} as never,
          sendPacketPreview: null,
          sendResult: {
            executedAt: new Date().toISOString(),
            candidateId: "c1",
            candidateName: "Alex Pilot",
            outcome: "sent",
            signatureRequestId: "sig-123",
            error: null,
            mode: "executeOne",
          },
          executedMode: "executeOne",
          executeBatchCalled: false,
        };
      }) as never,
    });

    assert.equal(executeOneCalls, 1);
    assert.equal(result.report.execution.executeBatchCalled, false);
    assert.equal(result.report.execution.outcome, "sent");
    assert.ok(result.report.operatorTimeline.some((entry) => entry.label === "Success"));
  });

  it("builds operator timeline and production readiness report", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p123-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const timeline = createOperatorTimeline();
    timeline.add("Queue built");
    timeline.add("Success", "dry run");
    const lines = formatOperatorTimeline(timeline.entries);
    assert.ok(lines[0]?.includes("Queue built"));

    const readiness = await buildProductionReadinessReport();
    assert.ok(["GO", "GO WITH CONDITIONS", "NO-GO"].includes(readiness.goNoGo));
    assert.equal(readiness.executionFlow.length, 10);
    assert.ok(readiness.retryPolicy.neverRetry.includes("already sent"));
  });
});
