import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import { buildManualFixVerificationFirstPilotRecheck } from "@/lib/p131-manual-fix-verification-first-pilot-recheck/build-manual-fix-verification";
import {
  P131_RECOMMENDED_JOB_ID,
  P131_TARGET_CANDIDATE_ID,
} from "@/lib/p131-manual-fix-verification-first-pilot-recheck/types";

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

function tyreeRow(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: P131_TARGET_CANDIDATE_ID,
    firstName: "Tyree nicole",
    lastName: "Gilley",
    email: "tyreenicolegilley932@gmail.com",
    positionId: "7959fdf7c9f1",
    positionName: "Retail Merchandiser",
    city: "South Lake Tahoe",
    state: "NV",
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
    createdDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function tyreeP109(): P109ReviewDecisionRecord {
  return {
    candidateId: P131_TARGET_CANDIDATE_ID,
    closedPositionId: "7959fdf7c9f1",
    recommendedPositionId: P131_RECOMMENDED_JOB_ID,
    decision: "approved",
    confidenceScore: 85,
    reviewer: "Taylor",
    timestamp: new Date().toISOString(),
    mappingReasons: ["Same city", "Same state", "Active posting exists"],
  };
}

function fixedContext() {
  const recommendedJob = {
    jobId: P131_RECOMMENDED_JOB_ID,
    name: "Retail Merchandiser - Local Store Support",
    city: "South Lake Tahoe",
    state: "NV",
    zip: "96150",
    displayLocation: "South Lake Tahoe, NV",
    locationSource: "breezy",
    status: "published",
    createdDate: "",
    updatedDate: "",
  } as const;
  const row = tyreeRow();
  const p109 = tyreeP109();
  return {
    rowsByCandidateId: new Map([[row.candidateId, row]]),
    jobsByPositionId: new Map(),
    closedJobsByPositionId: new Map(),
    publishedJobs: [recommendedJob],
    publishedJobTitleById: new Map([[recommendedJob.jobId, recommendedJob.name]]),
    onboardingByCandidateId: new Map(),
    p109ByCandidate: new Map([[row.candidateId, p109]]),
    approvedMappingsByCandidate: new Map(),
    p100SentIds: new Set(),
    pilotSentIds: new Set(),
    candidateIds: [row.candidateId],
  };
}

describe("p131-manual-fix-verification-first-pilot-recheck", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("verifies manual fixes without sending paperwork", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p131-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const report = await buildManualFixVerificationFirstPilotRecheck({
      contextOverride: fixedContext(),
    });

    assert.equal(report.sourcePhase, "P131");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.thresholdChanged, false);
    assert.equal(report.liveModeEnabled, false);
    assert.equal(report.verification.checks.length, 8);
    assert.ok(report.finalAllowlistCommand.includes(P131_TARGET_CANDIDATE_ID));
    assert.ok(report.finalLiveCommandPreview.includes("--execute"));
    assert.ok(["GO", "GO WITH CONDITIONS", "NO-GO"].includes(report.goNoGo));
  });

  it("reports AUTO_APPROVED when all manual fixes are applied", async () => {
    const report = await buildManualFixVerificationFirstPilotRecheck({
      contextOverride: fixedContext(),
    });

    assert.equal(report.verification.allPassed, true);
    assert.equal(report.autoApproved, true);
    assert.ok(report.approvalScore >= 90);
    assert.equal(report.p124Approval.approvalDecision, "AUTO_APPROVED");
    assert.equal(report.p123Orchestrator.approvedForQueue, true);
    assert.equal(report.p128PilotSelection.matchesTarget, true);
  });

  it("reports failed verification when fixes are incomplete", async () => {
    const context = fixedContext();
    const row = tyreeRow({ hasResume: false, assignedRecruiter: "Unassigned" });
    context.rowsByCandidateId.set(P131_TARGET_CANDIDATE_ID, row);
    const p109 = tyreeP109();
    p109.confidenceScore = 75;
    context.p109ByCandidate.set(P131_TARGET_CANDIDATE_ID, p109);

    const report = await buildManualFixVerificationFirstPilotRecheck({
      contextOverride: context,
    });

    assert.equal(report.verification.allPassed, false);
    assert.equal(report.autoApproved, false);
    assert.equal(report.goNoGo, "NO-GO");
  });

  it("never uses executeBatch", async () => {
    const report = await buildManualFixVerificationFirstPilotRecheck({
      contextOverride: fixedContext(),
    });
    assert.equal(report.executeBatchCalled, false);
  });
});
