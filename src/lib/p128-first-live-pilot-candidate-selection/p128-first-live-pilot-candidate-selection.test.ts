import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildFirstLivePilotCandidateSelection } from "@/lib/p128-first-live-pilot-candidate-selection/build-first-live-pilot-candidate-selection";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";

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
    candidateId: "p128-c1",
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

describe("p128-first-live-pilot-candidate-selection", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("selects exactly one pilot candidate in preview mode", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p128-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST", "");

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
    const row = baseRow();
    const context = {
      rowsByCandidateId: new Map([[row.candidateId, row]]),
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      publishedJobTitleById: new Map([[publishedJob.jobId, publishedJob.name]]),
      onboardingByCandidateId: new Map(),
      p109ByCandidate: new Map(),
      approvedMappingsByCandidate: new Map(),
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      candidateIds: [row.candidateId],
    };

    const report = await buildFirstLivePilotCandidateSelection({
      skipP127Drill: true,
      contextOverride: context,
    });
    assert.equal(report.sourcePhase, "P128");
    assert.equal(report.mode, "previewOnly");
    assert.ok(report.selectedCandidate.candidateId);
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);
    assert.equal(report.continuousRunnerEnabled, false);
    assert.ok(report.allowlistCommand.includes(report.selectedCandidate.candidateId));
    assert.ok(report.finalLiveCommand.includes(report.selectedCandidate.candidateId));
    assert.ok(["GO", "GO WITH CONDITIONS", "NO-GO"].includes(report.goNoGo));
  });

  it("ranks AUTO_APPROVED candidates ahead of blocked candidates", async () => {
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

    const readyRow = baseRow();
    const blockedRow = baseRow({
      candidateId: "p128-c2",
      email: "bad-email",
      firstName: "Bad",
      lastName: "Email",
    });

    const context = {
      rowsByCandidateId: new Map([
        ["p128-c1", readyRow],
        ["p128-c2", blockedRow],
      ]),
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      publishedJobTitleById: new Map([[publishedJob.jobId, publishedJob.name]]),
      onboardingByCandidateId: new Map(),
      p109ByCandidate: new Map(),
      approvedMappingsByCandidate: new Map(),
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      candidateIds: ["p128-c1", "p128-c2"],
    };

    const decisions = buildApprovalDecisionsFromContext(context);
    const ready = decisions.find((d) => d.candidateId === "p128-c1");
    const blocked = decisions.find((d) => d.candidateId === "p128-c2");
    assert.ok(ready);
    assert.ok(blocked);
    assert.ok((ready?.approvalScore ?? 0) >= (blocked?.approvalScore ?? 0));
  });

  it("never enables live mode or executeBatch", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p128-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "false");
    setEnv("P125_RUNNER_CONTINUOUS_ENABLED", "false");

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
    const row = baseRow();
    const context = {
      rowsByCandidateId: new Map([[row.candidateId, row]]),
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      publishedJobTitleById: new Map([[publishedJob.jobId, publishedJob.name]]),
      onboardingByCandidateId: new Map(),
      p109ByCandidate: new Map(),
      approvedMappingsByCandidate: new Map(),
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      candidateIds: [row.candidateId],
    };

    const report = await buildFirstLivePilotCandidateSelection({
      skipP127Drill: true,
      contextOverride: context,
    });
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.exactEnvVarsNeeded.AUTONOMOUS_PAPERWORK_LIVE_MODE, "true");
    assert.notEqual(process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE, "true");
  });
});
