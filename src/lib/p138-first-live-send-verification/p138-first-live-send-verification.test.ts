import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveP100State } from "@/lib/controlled-live-send/controlled-live-send-store";
import { savePilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { saveSchedulerState } from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";
import { buildFirstLiveSendVerification } from "@/lib/p138-first-live-send-verification/build-first-live-send-verification";
import { loadPilotSafetyLockState } from "@/lib/p138-first-live-send-verification/pilot-safety-lock-store";

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

async function seedSuccessfulPilotSend(candidateId: string) {
  const sentAt = new Date().toISOString();
  const signatureRequestId = "sig-p138-test-001";

  await savePilotSendRegistry({
    version: 1,
    updatedAt: sentAt,
    sendCount: 1,
    sends: [
      {
        candidateId,
        candidateName: "Alex Pilot",
        sentAt,
        signatureRequestId,
        auditEntryId: "audit-p138-001",
      },
    ],
    lastSendResult: {
      executedAt: sentAt,
      candidateId,
      candidateName: "Alex Pilot",
      outcome: "sent",
      signatureRequestId,
      error: null,
      mode: "executeOne",
    },
  });

  await saveP100State({
    version: 1,
    updatedAt: sentAt,
    sentCandidateIds: [candidateId],
    skippedCandidateIds: [],
    failedCandidateIds: [],
    lastExecutionAt: sentAt,
    lastMode: "executeOne",
  });

  await appendFile(
    path.join(tempDir, "p100-controlled-live-send-audit.jsonl"),
    `${JSON.stringify({
      id: "audit-p138-001",
      at: sentAt,
      phase: "P100",
      mode: "executeOne",
      candidateId,
      candidateName: "Alex Pilot",
      outcome: "sent",
      beforeState: {
        workflowStatus: "Paperwork Needed",
        actionType: "send-paperwork",
        paperworkStatus: "not_sent",
        signatureRequestId: null,
      },
      afterState: {
        workflowStatus: "Paperwork Sent",
        actionType: "await-signature",
        paperworkStatus: "sent",
        signatureRequestId,
      },
      signatureRequestId,
      simulated: false,
    })}\n`,
    "utf8",
  );

  await writeFile(
    path.join(tempDir, "candidate-workflows.json"),
    JSON.stringify(
      {
        version: 2,
        updatedAt: sentAt,
        workflows: {
          [candidateId]: {
            candidateId,
            workflowStatus: "Paperwork Sent",
            actionType: "await-signature",
            paperworkStatus: "sent",
            signatureRequestId,
            paperworkSentAt: sentAt,
          },
        },
        rosters: {
          recruiters: ["Taylor"],
          dms: ["Melissa"],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  await saveSchedulerState({
    version: 1,
    schedulerStatus: "stopped",
    schedulerMode: "stopped",
    continuousEnabled: false,
    scheduleIntervalMs: 300_000,
    startedAt: null,
    lastHeartbeatAt: sentAt,
    lastCycleAt: sentAt,
    lastSuccessfulCycleAt: sentAt,
    nextScheduledCycleAt: null,
    processingLock: null,
    currentPhase: null,
    lastError: null,
    lastCycleDurationMs: 1000,
    averageCycleDurationMs: 1000,
    cycleCount: 1,
    lastCycleMetrics: {
      candidatesEvaluated: 10,
      autoApproved: 1,
      humanReview: 0,
      blocked: 0,
      remediationsExecuted: 0,
      manualActionsRemaining: 0,
      approvalsUnlocked: 0,
      queueSize: 0,
      readinessCount: 0,
      estimatedPaperworkCapacity: 0,
    },
    uptimeStartedAt: null,
    executeBatchCalled: false,
    updatedAt: sentAt,
  });
}

describe("p138-first-live-send-verification", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("returns FAIL when no pilot send exists", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p138-empty-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const report = await buildFirstLiveSendVerification({ applySafetyLock: false });
    assert.equal(report.sourcePhase, "P138");
    assert.equal(report.overallResult, "FAIL");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.ok(report.recommendations.length > 0);
  });

  it("verifies successful executeOne and applies safety lock", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p138-pass-"));
    await mkdir(tempDir, { recursive: true });
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS", "1");

    const candidateId = "p138-c1";
    await seedSuccessfulPilotSend(candidateId);

    const report = await buildFirstLiveSendVerification({
      candidateId,
      applySafetyLock: true,
    });

    assert.equal(report.candidate.candidateId, candidateId);
    assert.equal(report.candidate.signatureRequestId, "sig-p138-test-001");
    assert.equal(report.overallResult, "PASS");
    assert.equal(report.auditVerification.found, true);
    assert.equal(report.duplicateVerification.wouldBlockResend, true);
    assert.equal(report.safetyLockStatus.applied, true);
    assert.equal(report.safetyLockStatus.executeOneBlocked, true);
    assert.equal(report.safetyLockStatus.pilotComplete, true);
    assert.equal(report.executivePanel.overallResult, "PASS");

    const lock = await loadPilotSafetyLockState();
    assert.ok(lock);
    assert.equal(lock.lockedCandidateId, candidateId);
    assert.equal(lock.requiredEnvLockdown.AUTONOMOUS_PAPERWORK_OPERATOR_GO, "false");
  });

  it("includes all nine verification checklist items", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p138-checks-"));
    await mkdir(tempDir, { recursive: true });
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);

    const candidateId = "p138-c2";
    await seedSuccessfulPilotSend(candidateId);

    const report = await buildFirstLiveSendVerification({ candidateId, applySafetyLock: false });
    assert.equal(report.verificationChecklist.length, 9);
    assert.ok(report.verificationChecklist.every((check) => typeof check.passed === "boolean"));
  });

  it("never sends paperwork or calls executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p138-safety-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);

    const report = await buildFirstLiveSendVerification({ applySafetyLock: false });
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.mode, "observeOnly");
  });
});
