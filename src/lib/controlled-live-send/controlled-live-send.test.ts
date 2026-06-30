import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_P84_FEATURE_FLAGS,
  saveP84FeatureFlags,
} from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import {
  appendP97Audit,
  appendP97Rollback,
  loadP97State,
  saveP97State,
} from "@/lib/approval-mode-production/approval-mode-store";
import { snapshotWorkflow } from "@/lib/approval-mode-production/persist-approved-candidate";
import {
  buildControlledLiveSendReport,
  executeControlledLiveSend,
} from "@/lib/controlled-live-send/execute-controlled-live-send";
import { P100_CONFIRMATION_PHRASE } from "@/lib/controlled-live-send/types";
import { saveLiveSendReadinessApproval } from "@/lib/live-send-readiness/live-send-readiness-store";

const envBackup: Record<string, string | undefined> = {};
let tempDir = "";

function setEnv(key: string, value: string): void {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  process.env[key] = value;
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

async function seedP97AndP99(candidateId: string): Promise<void> {
  await upsertCandidateWorkflow({
    candidateId,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    assignedRecruiter: "Taylor",
    assignedDM: "Melissa O'Connor",
    forceWorkflowStatus: true,
  });

  const workflows = await (await import("@/lib/candidate-workflow-store")).getCandidateWorkflowState();
  const beforeState = snapshotWorkflow(workflows[candidateId]);
  const afterState = snapshotWorkflow(workflows[candidateId]);
  const rollbackId = `rb-${candidateId}`;

  const state = await loadP97State();
  state.persisted.push({
    candidateId,
    candidateName: "Gary Smigocki",
    approvedBy: "Executive",
    approvedByUserId: "exec-1",
    approvedAt: new Date().toISOString(),
    beforeState,
    afterState,
    rollbackId,
  });
  state.updatedAt = new Date().toISOString();
  await saveP97State(state);

  await appendP97Rollback({
    rollbackId,
    candidateId,
    candidateName: "Gary Smigocki",
    createdAt: new Date().toISOString(),
    approvedBy: "Executive",
    beforeState,
    afterState,
    rollbackPlan: "Restore Applied.",
  });

  await appendP97Audit({
    id: `audit-${candidateId}`,
    at: new Date().toISOString(),
    phase: "P97",
    action: "approval_persist",
    candidateId,
    candidateName: "Gary Smigocki",
    approvedBy: "Executive",
    approvedByUserId: "exec-1",
    beforeState,
    afterState,
    liveSend: false,
    paperworkSent: false,
  });

  await saveLiveSendReadinessApproval({
    approved: true,
    approvedBy: "Executive",
    approvedByUserId: "exec-1",
    approvedAt: new Date().toISOString(),
    confirmationPhrase: "APPROVE LIVE SEND READINESS",
    candidateCountConfirmed: 1,
    dryRunReportTimestamp: state.updatedAt,
    readyCandidateCount: 1,
    liveSendEnabled: false,
    paperworkSent: false,
  });
}

describe("controlled-live-send (P100)", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("dryRun sends nothing", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p100-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);

    const candidateId = "p100-c1";
    await seedP97AndP99(candidateId);

    const { writeFile } = await import("node:fs/promises");
    const ingestionCandidate = {
      candidateId,
      firstName: "Gary",
      lastName: "Smigocki",
      email: "gary@example.com",
      phone: "555",
      source: "Indeed",
      stage: "Applied",
      appliedDate: "2026-06-05",
      createdDate: "2026-06-05",
      addedDate: "2026-06-05",
      updatedDate: "2026-06-05",
      addedDateSource: "creation_date",
      positionId: "p1",
      positionName: "Merchandiser",
      city: "Woodbury",
      state: "NJ",
      zipCode: "08096",
      resumeText: "retail merchandiser",
      hasResume: true,
      questionnaireAnswers: [],
      hasQuestionnaire: false,
    };
    await writeFile(
      path.join(tempDir, "candidate-ingestion.json"),
      `${JSON.stringify({
        version: 1,
        runId: "t",
        publishedPositionIds: ["p1"],
        publishedPositionsTotal: 1,
        scannedPositionIds: ["p1"],
        checkpointIndex: 0,
        candidates: { [candidateId]: ingestionCandidate },
        lastJobListAt: null,
        lastChunkAt: null,
        lastFullCycleAt: null,
        cycleComplete: true,
        chunksThisRun: 0,
        updatedAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    const result = await executeControlledLiveSend({ mode: "dryRun", mtdOnly: false });
    assert.equal(result.mode, "dryRun");
    assert.ok(result.executed.every((e) => e.outcome === "simulated" || e.outcome === "skipped"));
    assert.equal(result.executed.filter((e) => e.outcome === "sent").length, 0);
    assert.ok(result.warnings.some((w) => w.includes("dryRun")));
  });

  it("executeBatch cannot run unless all locks pass", async () => {
    await assert.rejects(
      () =>
        executeControlledLiveSend({
          mode: "executeBatch",
          executiveApprovalFlag: true,
          confirmationPhrase: P100_CONFIRMATION_PHRASE,
          candidateCount: 27,
        }),
      /Controlled live send blocked/,
    );
  });

  it("executeOne sends only one with mocked Dropbox", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p100-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);

    const candidateId = "p100-live-1";
    await seedP97AndP99(candidateId);

    const { writeFile } = await import("node:fs/promises");
    const ingestionCandidate = {
      candidateId,
      firstName: "Gary",
      lastName: "Smigocki",
      email: "gary@example.com",
      phone: "555",
      source: "Indeed",
      stage: "Applied",
      appliedDate: "2026-06-05",
      createdDate: "2026-06-05",
      addedDate: "2026-06-05",
      updatedDate: "2026-06-05",
      addedDateSource: "creation_date",
      positionId: "p1",
      positionName: "Merchandiser",
      city: "Woodbury",
      state: "NJ",
      zipCode: "08096",
      resumeText: "retail merchandiser",
      hasResume: true,
      questionnaireAnswers: [],
      hasQuestionnaire: false,
    };
    await writeFile(
      path.join(tempDir, "candidate-ingestion.json"),
      `${JSON.stringify({
        version: 1,
        runId: "t",
        publishedPositionIds: ["p1"],
        publishedPositionsTotal: 1,
        scannedPositionIds: ["p1"],
        checkpointIndex: 0,
        candidates: { [candidateId]: ingestionCandidate },
        lastJobListAt: null,
        lastChunkAt: null,
        lastFullCycleAt: null,
        cycleComplete: true,
        chunksThisRun: 0,
        updatedAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    await saveP84FeatureFlags({
      ...DEFAULT_P84_FEATURE_FLAGS,
      enabled: true,
      liveMode: true,
      liveSend: true,
      requireApproval: false,
      monitorSignatures: false,
    });

    let sendCalls = 0;

    const result = await executeControlledLiveSend({
      mode: "executeOne",
      executiveApprovalFlag: true,
      mtdOnly: false,
      sendDeps: {
        sendTemplateSignatureRequest: async () => {
          sendCalls += 1;
          return {
            signatureRequestId: "sig-mock-1",
            rawStatus: "sent",
            isComplete: false,
            isDeclined: false,
            signatures: [],
          };
        },
        resolveTemplateId: () => "template-mock",
      },
    });

    assert.equal(sendCalls, 1);
    assert.equal(result.executed.filter((e) => e.outcome === "sent").length, 1);
    assert.equal(result.executed[0]?.signatureRequestId, "sig-mock-1");

    const report = await buildControlledLiveSendReport({ mtdOnly: false });
    assert.equal(report.metrics.sent, 1);
  });
});
