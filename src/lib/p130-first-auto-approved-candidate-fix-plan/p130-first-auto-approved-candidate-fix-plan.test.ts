import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import { buildFirstAutoApprovedCandidateFixPlan } from "@/lib/p130-first-auto-approved-candidate-fix-plan/build-first-auto-approved-candidate-fix-plan";
import { P130_TARGET_CANDIDATE_ID } from "@/lib/p130-first-auto-approved-candidate-fix-plan/types";

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
    candidateId: P130_TARGET_CANDIDATE_ID,
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
    hasResume: false,
    candidateGrade: { paperworkReady: false },
    paperworkTemplateKey: "onboarding_packet",
    createdDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function tyreeP109(): P109ReviewDecisionRecord {
  return {
    candidateId: P130_TARGET_CANDIDATE_ID,
    closedPositionId: "7959fdf7c9f1",
    recommendedPositionId: "93ebc05539b8",
    decision: "approved",
    confidenceScore: 75,
    reviewer: "Taylor",
    timestamp: new Date().toISOString(),
    mappingReasons: ["Same city", "Same state", "Active posting exists"],
  };
}

describe("p130-first-auto-approved-candidate-fix-plan", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("analyzes Tyree without sending paperwork or writing Breezy", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p130-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const recommendedJob = {
      jobId: "93ebc05539b8",
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
    const context = {
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
      p109ByCandidate: new Map([[row.candidateId, p109]]),
      approvedMappingsByCandidate: new Map(),
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      candidateIds: [row.candidateId],
    };

    const report = await buildFirstAutoApprovedCandidateFixPlan({ contextOverride: context });
    assert.equal(report.sourcePhase, "P130");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.thresholdChanged, false);
    assert.equal(report.liveModeEnabled, false);
    assert.equal(report.currentState.approvalDecision, "NEEDS_HUMAN_APPROVAL");
    assert.ok(report.requiredFixes.length >= 2);
    assert.ok(report.simulation.steps.length >= 2);
    assert.ok(report.manualChecklist.length > 0);
  });

  it("simulates AUTO_APPROVED after required data fixes", async () => {
    const recommendedJob = {
      jobId: "93ebc05539b8",
      name: "Retail Merchandiser",
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
    const context = {
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

    const report = await buildFirstAutoApprovedCandidateFixPlan({ contextOverride: context });
    assert.equal(report.simulation.postFixDecision, "AUTO_APPROVED");
    assert.ok(report.simulation.postFixScore >= 90);
    assert.ok(
      report.requiredFixes.some((fix) => fix.id === "reassign_to_published_recommended_job"),
    );
    assert.equal(report.thresholdChanged, false);
  });

  it("never uses executeBatch", async () => {
    const report = await buildFirstAutoApprovedCandidateFixPlan({
      contextOverride: {
        rowsByCandidateId: new Map([[P130_TARGET_CANDIDATE_ID, tyreeRow()]]),
        jobsByPositionId: new Map(),
        closedJobsByPositionId: new Map(),
        publishedJobs: [],
        publishedJobTitleById: new Map(),
        onboardingByCandidateId: new Map(),
        p109ByCandidate: new Map([[P130_TARGET_CANDIDATE_ID, tyreeP109()]]),
        approvedMappingsByCandidate: new Map(),
        p100SentIds: new Set(),
        pilotSentIds: new Set(),
        candidateIds: [P130_TARGET_CANDIDATE_ID],
      },
    });
    assert.equal(report.executeBatchCalled, false);
  });
});
