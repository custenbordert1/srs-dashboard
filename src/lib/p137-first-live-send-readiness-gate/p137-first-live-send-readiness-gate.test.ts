import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { buildFirstLiveSendReadinessGate } from "@/lib/p137-first-live-send-readiness-gate/build-first-live-send-readiness-gate";

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
    candidateId: "p137-c1",
    firstName: "Alex",
    lastName: "Pilot",
    email: "alex.pilot@example.com",
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
    createdDate: new Date().toISOString(),
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function mockContext(rows: ScoredCandidateWorkflowRow[]) {
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
    rowsByCandidateId: new Map(rows.map((row) => [row.candidateId, row])),
    jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
    closedJobsByPositionId: new Map(),
    publishedJobs: [publishedJob],
    publishedJobTitleById: new Map([[publishedJob.jobId, publishedJob.name]]),
    onboardingByCandidateId: new Map(),
    p109ByCandidate: new Map(),
    approvedMappingsByCandidate: new Map(),
    p100SentIds: new Set(),
    pilotSentIds: new Set(),
    candidateIds: rows.map((row) => row.candidateId),
  };
}

describe("p137-first-live-send-readiness-gate", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("selects exactly one AUTO_APPROVED pilot candidate", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p137-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST", "");

    const report = await buildFirstLiveSendReadinessGate({
      contextOverride: mockContext([baseRow()]),
    });

    assert.equal(report.sourcePhase, "P137");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.selectedCandidate.approvalDecision, "AUTO_APPROVED");
    assert.ok(report.selectedCandidate.candidateId);
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);
    assert.equal(report.safetyChecklist.executeOneOnly, true);
    assert.equal(report.safetyChecklist.pilotCapOne, true);
    assert.equal(report.safetyChecklist.noBreezyWrites, true);
    assert.equal(report.safetyChecklist.liveModeDisabledByDefault, true);
    assert.ok(report.allowlistCommand.includes(report.selectedCandidate.candidateId));
    assert.ok(report.finalLiveCommand.includes(report.selectedCandidate.candidateId));
    assert.ok(report.finalLiveCommand.includes("SEND 1 PAPERWORK PACKET"));
    assert.ok(["GO", "GO WITH CONDITIONS", "NO-GO"].includes(report.goNoGo));
  });

  it("filters to AUTO_APPROVED candidates only", async () => {
    const readyRow = baseRow();
    const blockedRow = baseRow({
      candidateId: "p137-c2",
      email: "bad-email",
      firstName: "Bad",
      lastName: "Email",
    });
    const context = mockContext([readyRow, blockedRow]);
    const decisions = buildApprovalDecisionsFromContext(context);
    const autoApproved = decisions.filter((d) => d.approvalDecision === "AUTO_APPROVED");

    const report = await buildFirstLiveSendReadinessGate({ contextOverride: context });
    assert.equal(report.autoApprovedCount, autoApproved.length);
    assert.equal(report.selectedCandidate.approvalDecision, "AUTO_APPROVED");
    assert.notEqual(report.selectedCandidate.candidateId, blockedRow.candidateId);
  });

  it("includes pre-send packet with approval score and safety checks", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p137-packet-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const report = await buildFirstLiveSendReadinessGate({
      contextOverride: mockContext([baseRow()]),
    });

    assert.ok(report.sendPacketPreview);
    assert.ok(report.sendPacketPreview.approvalScore >= 90);
    assert.ok(report.sendPacketPreview.auditDestination);
    assert.ok(report.sendPacketPreview.safetyChecks.length > 0);
    assert.equal(report.exactEnvVarsNeeded.AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS, "1");
  });

  it("never enables live mode or executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p137-safety-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "false");
    setEnv("P125_RUNNER_CONTINUOUS_ENABLED", "false");

    const report = await buildFirstLiveSendReadinessGate({
      contextOverride: mockContext([baseRow()]),
    });

    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.safetyChecklist.executeBatchForbidden, true);
    assert.equal(report.continuousRunnerEnabled, false);
    assert.notEqual(process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE, "true");
  });
});
