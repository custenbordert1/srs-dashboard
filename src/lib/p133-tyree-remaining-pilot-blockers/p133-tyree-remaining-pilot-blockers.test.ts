import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import { buildTyreeRemainingPilotBlockers } from "@/lib/p133-tyree-remaining-pilot-blockers/build-tyree-remaining-pilot-blockers";
import {
  P133_RECOMMENDED_JOB_ID,
  P133_TARGET_CANDIDATE_ID,
} from "@/lib/p133-tyree-remaining-pilot-blockers/types";

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
    candidateId: P133_TARGET_CANDIDATE_ID,
    firstName: "Tyree nicole",
    lastName: "Gilley",
    email: "tyreenicolegilley932@gmail.com",
    positionId: "7959fdf7c9f1",
    positionName: "Closed Merchandiser",
    city: "South Lake Tahoe",
    state: "NV",
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    assignedRecruiter: "Unassigned",
    assignedDM: "Melissa",
    stage: "Applied",
    hasResume: true,
    candidateGrade: { paperworkReady: false },
    paperworkTemplateKey: "onboarding_packet",
    createdDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function tyreeP109(): P109ReviewDecisionRecord {
  return {
    candidateId: P133_TARGET_CANDIDATE_ID,
    closedPositionId: "7959fdf7c9f1",
    recommendedPositionId: P133_RECOMMENDED_JOB_ID,
    decision: "approved",
    confidenceScore: 75,
    reviewer: "Taylor",
    timestamp: new Date().toISOString(),
    mappingReasons: ["Same city", "Same state", "Active posting exists"],
  };
}

function tyreeContext(row = tyreeRow()) {
  const recommendedJob = {
    jobId: P133_RECOMMENDED_JOB_ID,
    name: "Retail Merchandiser - Local Store Support - South Lake Tahoe, NV",
    city: "South Lake Tahoe",
    state: "NV",
    zip: "96150",
    displayLocation: "South Lake Tahoe, NV",
    locationSource: "breezy",
    status: "published",
    createdDate: "",
    updatedDate: "",
  } as const;

  return {
    rowsByCandidateId: new Map([[row.candidateId, row]]),
    jobsByPositionId: new Map(),
    closedJobsByPositionId: new Map([
      [
        "7959fdf7c9f1",
        {
          jobId: "7959fdf7c9f1",
          name: "Closed Merchandiser",
          city: "South Lake Tahoe",
          state: "NV",
          zip: "96150",
          displayLocation: "South Lake Tahoe, NV",
          locationSource: "breezy",
          status: "closed",
          createdDate: "",
          updatedDate: "",
        },
      ],
    ]),
    publishedJobs: [recommendedJob],
    publishedJobTitleById: new Map([[recommendedJob.jobId, recommendedJob.name]]),
    onboardingByCandidateId: new Map(),
    p109ByCandidate: new Map([[row.candidateId, tyreeP109()]]),
    approvedMappingsByCandidate: new Map(),
    p100SentIds: new Set(),
    pilotSentIds: new Set(),
    candidateIds: [row.candidateId],
  };
}

describe("p133-tyree-remaining-pilot-blockers", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("analyzes post-P132 remaining blockers without sending or Breezy writes", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p133-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const report = await buildTyreeRemainingPilotBlockers({ contextOverride: tyreeContext() });
    assert.equal(report.sourcePhase, "P133");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.thresholdChanged, false);
    assert.equal(report.p132ResumeFix.hasResume, true);
    assert.ok(report.failedGateCount >= 3);
    assert.ok(report.remainingFixes.length >= 3);
    assert.equal(report.jobRemediation.recommendedJobPublished, true);
    assert.equal(report.jobRemediation.action, "reassign_to_recommended");
    assert.equal(report.jobRemediation.requiresPublish, false);
    assert.ok(report.manualSteps.length > 0);
    assert.ok(report.softwareSteps.length > 0);
  });

  it("expects AUTO_APPROVED after remaining fixes are simulated", async () => {
    const report = await buildTyreeRemainingPilotBlockers({ contextOverride: tyreeContext() });
    assert.equal(report.expectedPostFixDecision, "AUTO_APPROVED");
    assert.ok(report.expectedPostFixScore >= 90);
    assert.ok(report.remainingFixes.some((fix) => fix.id === "mark_paperwork_ready"));
    assert.ok(report.remainingFixes.some((fix) => fix.id === "raise_mapping_confidence_80"));
    assert.ok(report.remainingFixes.some((fix) => fix.id === "reassign_to_published_recommended_job"));
  });

  it("flags P132-resolved resume separately from paperworkReady gate", async () => {
    const report = await buildTyreeRemainingPilotBlockers({ contextOverride: tyreeContext() });
    const resumeGate = report.failedGates.find((gate) => gate.id === "questionnaire_resume_complete");
    assert.ok(resumeGate);
    assert.equal(resumeGate?.resolvedByP132, true);
    assert.equal(report.p132ResumeFix.applied, true);
  });

  it("never uses executeBatch", async () => {
    const report = await buildTyreeRemainingPilotBlockers({ contextOverride: tyreeContext() });
    assert.equal(report.executeBatchCalled, false);
  });
});
