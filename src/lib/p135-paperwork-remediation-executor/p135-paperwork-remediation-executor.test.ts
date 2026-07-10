import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import { buildPaperworkRemediationReport } from "@/lib/p134-paperwork-remediation-engine/build-paperwork-remediation-report";
import { clonePaperworkContext } from "@/lib/p135-paperwork-remediation-executor/clone-paperwork-context";
import { buildPaperworkRemediationExecutorReport } from "@/lib/p135-paperwork-remediation-executor/build-paperwork-remediation-executor-report";
import { executeCandidateRemediationPreview } from "@/lib/p135-paperwork-remediation-executor/execute-candidate-remediation";
import { SAFE_REMEDIATION_ACTIONS, HUMAN_REMEDIATION_ACTIONS } from "@/lib/p135-paperwork-remediation-executor/remediation-action-catalog";
import { P133_RECOMMENDED_JOB_ID, P133_TARGET_CANDIDATE_ID } from "@/lib/p133-tyree-remaining-pilot-blockers/types";

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

function tyreeRow(): ScoredCandidateWorkflowRow {
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
    mappingReasons: ["Same city", "Same state"],
  };
}

function tyreeContext() {
  const row = tyreeRow();
  const recommendedJob = {
    jobId: P133_RECOMMENDED_JOB_ID,
    name: "Retail Merchandiser - South Lake Tahoe, NV",
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

describe("p135-paperwork-remediation-executor", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("defines safe and human remediation action catalogs", () => {
    assert.ok(SAFE_REMEDIATION_ACTIONS.length >= 10);
    assert.ok(HUMAN_REMEDIATION_ACTIONS.length >= 5);
    assert.ok(!SAFE_REMEDIATION_ACTIONS.includes("send_paperwork" as never));
    assert.ok(HUMAN_REMEDIATION_ACTIONS.includes("send_paperwork"));
  });

  it("executes preview remediation for Tyree without Breezy writes", async () => {
    const context = tyreeContext();
    const remediation = await buildPaperworkRemediationReport({ contextOverride: context });
    const plan = remediation.candidatePlans.find((entry) => entry.candidateId === P133_TARGET_CANDIDATE_ID);
    assert.ok(plan);

    const cloned = clonePaperworkContext(context);
    const ingestionByCandidateId = new Map([
      [
        P133_TARGET_CANDIDATE_ID,
        {
          ...tyreeRow(),
          hasResume: true,
          resumeAssets: [{ source: "documents" as const, fileName: "resume.pdf", mimeType: null, url: null, parsedTextPreview: null }],
        },
      ],
    ]);

    const result = await executeCandidateRemediationPreview({
      context: cloned,
      plan,
      ingestionByCandidateId,
    });

    assert.ok(result.automaticActionsCompleted > 0);
    assert.ok(result.executionRecords.length >= SAFE_REMEDIATION_ACTIONS.length);
    assert.ok(result.executionRecords.every((record) => record.automatic));
    assert.ok(result.afterScore >= result.beforeScore);
    assert.ok(result.humanTasks.length > 0);
    assert.ok(result.humanTasks.some((task) => task.action === "assign_recruiter_breezy"));
  });

  it("builds executor preview report with executive panel fields", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p135-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const report = await buildPaperworkRemediationExecutorReport({
      previewOnly: true,
      maxCandidates: 1,
      tierFilter: [1, 2, 3],
      contextOverride: tyreeContext(),
    });

    assert.equal(report.sourcePhase, "P135");
    assert.equal(report.previewOnly, true);
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.ok(report.executivePanel.automaticFixesCompleted > 0);
    assert.ok(report.executivePanel.manualFixesRemaining > 0);
    assert.ok(report.executivePanel.auditHistory.length > 0);
    assert.ok(Array.isArray(report.humanTaskQueue));
  });

  it("never uses executeBatch", async () => {
    const report = await buildPaperworkRemediationExecutorReport({
      previewOnly: true,
      maxCandidates: 1,
      contextOverride: tyreeContext(),
    });
    assert.equal(report.executeBatchCalled, false);
  });
});
