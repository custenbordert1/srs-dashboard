import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildAutoApprovalGapAnalysis } from "@/lib/p129-auto-approval-gap-analysis/build-auto-approval-gap-analysis";

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
    candidateId: "p129-c1",
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

describe("p129-auto-approval-gap-analysis", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("analyzes near-ready candidates without sending paperwork", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p129-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

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

    const report = await buildAutoApprovalGapAnalysis({ contextOverride: context });
    assert.equal(report.sourcePhase, "P129");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);
    assert.ok(report.nearReadyCandidates.length >= 1);
    assert.ok(report.nearReadyCandidates[0]?.exactBlockerPreventingAutoApproved);
    assert.ok(["GO", "GO WITH CONDITIONS", "NO-GO"].includes(report.goNoGo));
    assert.ok(report.safestPathToFirstAutoApproved.steps.length > 0);
  });

  it("explains why high-score candidates are not AUTO_APPROVED", async () => {
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

    const report = await buildAutoApprovalGapAnalysis({ contextOverride: context });
    const candidate = report.nearReadyCandidates[0];
    assert.ok(candidate);
    if (candidate.currentDecision !== "AUTO_APPROVED") {
      assert.ok(candidate.exactBlockerPreventingAutoApproved.length > 0);
      assert.ok(candidate.remediationSteps.length > 0);
    }
  });

  it("never uses executeBatch", async () => {
    const report = await buildAutoApprovalGapAnalysis({
      contextOverride: {
        rowsByCandidateId: new Map(),
        jobsByPositionId: new Map(),
        closedJobsByPositionId: new Map(),
        publishedJobs: [],
        publishedJobTitleById: new Map(),
        onboardingByCandidateId: new Map(),
        p109ByCandidate: new Map(),
        approvedMappingsByCandidate: new Map(),
        p100SentIds: new Set(),
        pilotSentIds: new Set(),
        candidateIds: [],
      },
    });
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.summary.autoApprovedCount, 0);
  });
});
