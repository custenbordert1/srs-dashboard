import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  listAllCandidateOnboardingRecords,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  appendPaperworkSendAuditEvent,
  buildPaperworkRetryPlan,
  buildPaperworkSendEligibility,
  countEligiblePaperworkSends,
  loadPaperworkSendAuditLog,
  runAutonomousPaperworkSend,
  runSignatureMonitoring,
  saveP84FeatureFlags,
} from "@/lib/autonomous-paperwork-send-engine";
import {
  canLiveSendPaperwork,
  DEFAULT_P84_FEATURE_FLAGS,
} from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { getCandidateWorkflowState, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

let isolation: IsolatedRecruitingDataHandle;

const REFERENCE = "2026-06-26T15:00:00.000Z";
const JOB = { jobId: "pos-1", name: "Henkel Merchandiser", state: "published" } as const;

function workflowRow(
  overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId: string },
): ScoredCandidateWorkflowRow {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    positionId: "pos-1",
    assignedRecruiter: "Amy Harp",
    assignedDM: "DM South",
    city: "Houston",
    state: "TX",
    positionName: "Henkel Merchandiser",
    actionGeneratedAt: "2026-06-25T10:00:00.000Z",
    aiGrade: "B",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    paperworkSignedAt: null,
    paperworkError: null,
    signatureRequestId: null,
    actionType: "send-paperwork",
    paperworkTemplateKey: "onboarding_packet",
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

async function resetStores() {
  delete process.env.P84_ENABLED;
  delete process.env.P84_LIVE_MODE;
  delete process.env.P84_LIVE_SEND;
  delete process.env.P84_REQUIRE_APPROVAL;
  delete process.env.P84_MONITOR_SIGNATURES;
  delete process.env.P84_MAX_SENDS_PER_RUN;
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(
    path.join(recruitingDataDir(), "candidate-workflows.json"),
    `${JSON.stringify({ workflows: {}, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(recruitingDataDir(), "candidate-onboarding-records.json"),
    `${JSON.stringify({ records: [], updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(recruitingDataDir(), "p84-paperwork-send-audit.json"),
    `${JSON.stringify({ events: [], updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(recruitingDataDir(), "p84-paperwork-send-flags.json"),
    `${JSON.stringify(
      {
        flags: { ...DEFAULT_P84_FEATURE_FLAGS, monitorSignatures: false },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await saveP84FeatureFlags({
    ...DEFAULT_P84_FEATURE_FLAGS,
    monitorSignatures: false,
  });
}

async function enableLiveSendForTest() {
  await saveP84FeatureFlags({
    ...DEFAULT_P84_FEATURE_FLAGS,
    enabled: true,
    liveMode: true,
    liveSend: true,
    requireApproval: false,
    monitorSignatures: false,
  });
}

describe("autonomous-paperwork-send-engine", () => {
  before(async () => {
    isolation = await installIsolatedRecruitingDataDir("p84-send-test-");
  });

  after(async () => {
    delete process.env.SRS_RECRUITING_DATA_DIR;
    delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    await isolation.restore();
  });

  beforeEach(async () => {
    process.env.SRS_RECRUITING_DATA_DIR = isolation.dir;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = isolation.dir;
    await resetStores();
  });

  it("defaults to safe mode with no live send path", () => {
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.enabled, false);
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveMode, false);
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
  });

  it("does not call Dropbox Sign with default safe flags", async () => {
    let sendCalled = false;
    const result = await runAutonomousPaperworkSend({
      candidates: [workflowRow({ candidateId: "safe-default-1" })],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
      sendDeps: {
        sendTemplateSignatureRequest: async () => {
          sendCalled = true;
          return {
            signatureRequestId: "sig-should-not-run",
            rawStatus: "awaiting_signature",
            isComplete: false,
            isDeclined: false,
            signatures: [],
          };
        },
        resolveTemplateId: () => "template-1",
      },
    });

    assert.equal(sendCalled, false);
    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 0);
  });

  it("evaluates eligibility for assigned MTD paperwork-needed candidates", () => {
    const eligible = buildPaperworkSendEligibility({
      row: workflowRow({ candidateId: "ready-1" }),
      onboarding: null,
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
    });
    assert.equal(eligible.eligible, true);

    const blocked = buildPaperworkSendEligibility({
      row: workflowRow({ candidateId: "dup-1", signatureRequestId: "sig-existing", paperworkStatus: "sent" }),
      onboarding: null,
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
    });
    assert.equal(blocked.eligible, false);
    assert.ok(blocked.blockingReasons.some((reason) => /duplicate|already/i.test(reason)));
  });

  it("blocks duplicate sends when signature request already exists", async () => {
    await saveP84FeatureFlags({
      ...DEFAULT_P84_FEATURE_FLAGS,
      enabled: true,
      liveMode: true,
      liveSend: false,
      monitorSignatures: false,
    });
    const row = workflowRow({
      candidateId: "dup-2",
      workflowStatus: "Paperwork Sent",
      signatureRequestId: "sig-1",
      paperworkStatus: "sent",
    });

    const result = await runAutonomousPaperworkSend({
      candidates: [row],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
      sendDeps: {
        sendTemplateSignatureRequest: async () => ({
          signatureRequestId: "sig-new",
          rawStatus: "awaiting_signature",
        }),
        resolveTemplateId: () => "template-1",
      },
    });

    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.eligible, 0);
  });

  it("performs automatic send and sets await-signature action", async () => {
    await enableLiveSendForTest();
    const row = workflowRow({ candidateId: "send-1" });
    const result = await runAutonomousPaperworkSend({
      candidates: [row],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
      sendDeps: {
        sendTemplateSignatureRequest: async () => ({
          signatureRequestId: "sig-auto-1",
          rawStatus: "awaiting_signature",
          isComplete: false,
          isDeclined: false,
          signatures: [],
        }),
        resolveTemplateId: () => "template-1",
      },
    });

    assert.equal(result.sent, 1);
    const workflows = await getCandidateWorkflowState();
    assert.equal(workflows["send-1"]?.workflowStatus, "Paperwork Sent");
    assert.equal(workflows["send-1"]?.actionType, "await-signature");
    assert.equal(workflows["send-1"]?.signatureRequestId, "sig-auto-1");

    const records = await listAllCandidateOnboardingRecords();
    assert.ok(records.some((record) => record.candidateId === "send-1"));
  });

  it("schedules retry on transient failure", async () => {
    await enableLiveSendForTest();
    const row = workflowRow({ candidateId: "retry-1" });
    const result = await runAutonomousPaperworkSend({
      candidates: [row],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
      sendDeps: {
        sendTemplateSignatureRequest: async () => {
          throw new Error("Dropbox rate limited");
        },
        resolveTemplateId: () => "template-1",
      },
    });

    assert.equal(result.sent, 0);
    assert.equal(result.retriesScheduled, 1);
    const records = await listAllCandidateOnboardingRecords();
    const record = records.find((entry) => entry.candidateId === "retry-1");
    assert.equal(record?.status, "retry_scheduled");
    assert.ok(record?.nextRetryAt);
  });

  it("builds retry plan and moves to failed queue when exhausted", () => {
    const retry = buildPaperworkRetryPlan({
      attemptNumber: 1,
      maxAttempts: 3,
      transient: true,
      baseBackoffMs: 30_000,
      referenceMs: Date.parse(REFERENCE),
    });
    assert.equal(retry.shouldRetry, true);

    const exhausted = buildPaperworkRetryPlan({
      attemptNumber: 3,
      maxAttempts: 3,
      transient: true,
      baseBackoffMs: 30_000,
    });
    assert.equal(exhausted.moveToFailedQueue, true);
  });

  it("marks signed candidates Ready for MEL during signature monitoring", async () => {
    await upsertCandidateWorkflow({
      candidateId: "signed-1",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
      signatureRequestId: "sig-signed-1",
      paperworkSignedAt: REFERENCE,
      paperworkSentAt: "2026-06-25T10:00:00.000Z",
      assignedRecruiter: "Amy Harp",
    });

    const row = workflowRow({
      candidateId: "signed-1",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
      signatureRequestId: "sig-signed-1",
      paperworkSignedAt: REFERENCE,
      paperworkSentAt: "2026-06-25T10:00:00.000Z",
    });

    const monitoring = await runSignatureMonitoring({ candidates: [row] });
    assert.equal(monitoring.readyForMel, 1);

    const workflows = await getCandidateWorkflowState();
    assert.equal(workflows["signed-1"]?.workflowStatus, "Ready for MEL");
  });

  it("audits simulated sends when liveSend is disabled", async () => {
    await saveP84FeatureFlags({
      ...DEFAULT_P84_FEATURE_FLAGS,
      enabled: true,
      liveMode: true,
      liveSend: false,
      requireApproval: false,
    });

    const row = workflowRow({ candidateId: "sim-1" });
    const result = await runAutonomousPaperworkSend({
      candidates: [row],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
    });

    assert.equal(result.sent, 0);
    assert.equal(result.skipped, 1);
    const audit = await loadPaperworkSendAuditLog();
    assert.equal(audit.length, 1);
    assert.equal(audit[0]?.simulated, true);
    assert.equal(audit[0]?.candidateId, "sim-1");
  });

  it("appends audit events with retry metadata", async () => {
    await appendPaperworkSendAuditEvent({
      id: "audit-test-1",
      at: REFERENCE,
      candidateId: "audit-1",
      phase: "P84",
      previousStatus: "Paperwork Needed",
      newStatus: "Paperwork Needed",
      reason: "Retry scheduled",
      retryCount: 2,
      error: "timeout",
      simulated: false,
    });
    const audit = await loadPaperworkSendAuditLog();
    assert.equal(audit[0]?.retryCount, 2);
    assert.equal(audit[0]?.error, "timeout");
  });

  it("counts eligible immediate sends", () => {
    const count = countEligiblePaperworkSends({
      candidates: [
        workflowRow({ candidateId: "c-1" }),
        workflowRow({ candidateId: "c-2", workflowStatus: "Interview" }),
      ],
      onboardingByCandidateId: new Map<string, CandidateOnboardingRecord>(),
      jobsByPositionId: new Map([[JOB.jobId, JOB as never]]),
    });
    assert.equal(count, 1);
  });
});
