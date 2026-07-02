import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import { buildPaperworkRemediationReport } from "@/lib/p134-paperwork-remediation-engine/build-paperwork-remediation-report";
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

describe("p134-paperwork-remediation-engine", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("analyzes blocked candidates without production writes", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p134-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const report = await buildPaperworkRemediationReport({ contextOverride: tyreeContext() });
    assert.equal(report.sourcePhase, "P134");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.summary.blockedCandidateCount, 1);
    assert.ok(report.candidatePlans.length === 1);
    assert.ok(report.executivePanel.totalBlockedCandidates === 1);
    assert.ok(report.blockersByCategory.length > 0);
  });

  it("classifies Tyree post-P132 blockers with remediation metadata", async () => {
    const report = await buildPaperworkRemediationReport({ contextOverride: tyreeContext() });
    const tyree = report.candidatePlans.find((p) => p.candidateId === P133_TARGET_CANDIDATE_ID);
    assert.ok(tyree);
    assert.equal(tyree.currentDecision, "NEEDS_HUMAN_APPROVAL");
    assert.ok(tyree.blockers.some((b) => b.id === "paperwork_ready_missing"));
    assert.ok(tyree.blockers.some((b) => b.id === "recruiter_assignment_missing"));
    assert.ok(tyree.blockers.some((b) => b.id === "mapping_confidence_below_threshold"));
    assert.ok(tyree.blockers.every((b) => typeof b.expectedScoreImprovement === "number"));
    assert.ok(tyree.blockers.every((b) => b.remediationSteps.length > 0));
    assert.equal(tyree.simulatedPostFixDecision, "AUTO_APPROVED");
    assert.ok(tyree.simulatedPostFixScore >= 90);
  });

  it("assigns priority tiers and executive summary fields", async () => {
    const report = await buildPaperworkRemediationReport({ contextOverride: tyreeContext() });
    assert.ok([1, 2, 3].includes(report.summary.tier1Count + report.summary.tier2Count + report.summary.tier3Count));
    assert.equal(
      report.summary.tier1Count + report.summary.tier2Count + report.summary.tier3Count,
      report.summary.blockedCandidateCount,
    );
    assert.ok(report.executivePanel.closestToAutoApproved.length > 0);
    assert.ok(report.topRecurringRootCauses.length > 0);
    assert.equal(report.summary.estimatedApprovalsUnlocked, 1);
  });

  it("never uses executeBatch", async () => {
    const report = await buildPaperworkRemediationReport({ contextOverride: tyreeContext() });
    assert.equal(report.executeBatchCalled, false);
  });
});
