import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  canLiveSendPaperwork,
  DEFAULT_P84_FEATURE_FLAGS,
  loadP84FeatureFlags,
} from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import {
  appendP97Audit,
  appendP97Rollback,
  loadP97State,
  saveP97State,
} from "@/lib/approval-mode-production/approval-mode-store";
import { snapshotWorkflow } from "@/lib/approval-mode-production/persist-approved-candidate";
import { approveLiveSendReadiness } from "@/lib/live-send-readiness/approve-live-send-readiness";
import { buildLiveSendReadinessFromStores } from "@/lib/live-send-readiness/build-live-send-readiness";
import { P99_CONFIRMATION_PHRASE } from "@/lib/live-send-readiness/types";
import { loadLiveSendReadinessApproval } from "@/lib/live-send-readiness/live-send-readiness-store";

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

async function seedPersistedCandidate(candidateId: string): Promise<void> {
  await upsertCandidateWorkflow({
    candidateId,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    assignedRecruiter: "Taylor",
    assignedDM: "Melissa O'Connor",
    forceWorkflowStatus: true,
  });
  const workflow = (await import("@/lib/candidate-workflow-store")).getCandidateWorkflowState;
  const bundle = await workflow();
  const beforeState = snapshotWorkflow(bundle[candidateId]);
  const afterState = snapshotWorkflow(bundle[candidateId]);
  const rollbackId = `rollback-${candidateId}`;

  const state = await loadP97State();
  state.persisted.push({
    candidateId,
    candidateName: "Test Candidate",
    approvedBy: "Executive",
    approvedByUserId: "exec-1",
    approvedAt: new Date().toISOString(),
    beforeState,
    afterState,
    rollbackId,
  });
  await saveP97State(state);

  await appendP97Rollback({
    rollbackId,
    candidateId,
    candidateName: "Test Candidate",
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
    candidateName: "Test Candidate",
    approvedBy: "Executive",
    approvedByUserId: "exec-1",
    beforeState,
    afterState,
    liveSend: false,
    paperworkSent: false,
  });
}

describe("live-send-readiness (P99)", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("never enables liveSend by default", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("rejects approval without executive flag or phrase", async () => {
    const report = await buildLiveSendReadinessFromStores({ mtdOnly: false });
    await assert.rejects(
      () =>
        approveLiveSendReadiness({
          approvedBy: "Executive",
          approvedByUserId: "exec-1",
          confirmationPhrase: "wrong",
          candidateCount: report.metrics.readinessPassCount,
          dryRunReportTimestamp: report.dryRunReportTimestamp,
          executiveApprovalFlag: true,
        }),
      /Invalid confirmation phrase/,
    );
    await assert.rejects(
      () =>
        approveLiveSendReadiness({
          approvedBy: "Executive",
          approvedByUserId: "exec-1",
          confirmationPhrase: P99_CONFIRMATION_PHRASE,
          candidateCount: report.metrics.readinessPassCount,
          dryRunReportTimestamp: report.dryRunReportTimestamp,
          executiveApprovalFlag: false,
        }),
      /executiveApprovalFlag/,
    );
  });

  it("approves readiness without enabling liveSend or sending paperwork", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p99-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);

    const candidateId = "p99-ready-1";
    await seedPersistedCandidate(candidateId);

    const ingestionPath = path.join(tempDir, "candidate-ingestion.json");
    await writeFile(
      ingestionPath,
      `${JSON.stringify({
        version: 1,
        runId: "test",
        publishedPositionIds: ["p1"],
        publishedPositionsTotal: 1,
        scannedPositionIds: ["p1"],
        checkpointIndex: 0,
        candidates: {
          [candidateId]: {
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
          },
        },
        lastJobListAt: null,
        lastChunkAt: null,
        lastFullCycleAt: null,
        cycleComplete: true,
        chunksThisRun: 0,
        updatedAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    );

    const report = await buildLiveSendReadinessFromStores({ mtdOnly: false });
    assert.equal(report.liveSend, false);
    assert.equal(report.metrics.totalCandidates, 1);
    assert.equal(report.metrics.readinessPassCount, 1);
    assert.equal(report.metrics.readinessBlockedCount, 0);

    const entry = report.candidates[0];
    assert.ok(entry?.ready);
    assert.equal(entry?.gates.find((g) => g.id === "rollback_available")?.passed, true);
    assert.equal(entry?.gates.find((g) => g.id === "audit_log_exists")?.passed, true);

    const result = await approveLiveSendReadiness({
      approvedBy: "Executive User",
      approvedByUserId: "exec-1",
      confirmationPhrase: P99_CONFIRMATION_PHRASE,
      candidateCount: report.metrics.readinessPassCount,
      dryRunReportTimestamp: report.dryRunReportTimestamp,
      executiveApprovalFlag: true,
      mtdOnly: false,
    });

    assert.equal(result.approval.liveSendEnabled, false);
    assert.equal(result.approval.paperworkSent, false);
    assert.equal(result.report.readinessApproved, true);

    const flags = await loadP84FeatureFlags();
    assert.equal(flags.liveSend, false);

    const approvalFile = await loadLiveSendReadinessApproval();
    assert.equal(approvalFile.approval?.approvedBy, "Executive User");

    const raw = await readFile(path.join(tempDir, "p99-live-send-readiness-approval.json"), "utf8");
    assert.ok(raw.includes("liveSendEnabled"));
    assert.ok(!raw.includes('"liveSendEnabled": true'));
  });
});
