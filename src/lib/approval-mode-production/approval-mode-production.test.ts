import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, afterEach } from "node:test";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { getCandidateWorkflowState, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import {
  loadP97RollbackFile,
  loadP97State,
  p97AuditLogPath,
} from "@/lib/approval-mode-production/approval-mode-store";
import { executeApprovalModePersistence } from "@/lib/approval-mode-production/execute-approval-persistence";
import { persistApprovedCandidate } from "@/lib/approval-mode-production/persist-approved-candidate";
import type { P84SendQueueEntry } from "@/lib/p84-send-queue-preview/types";

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

function sendEntry(candidateId: string): P84SendQueueEntry {
  return {
    candidateId,
    candidateName: "Test Candidate",
    email: "test@example.com",
    recruiter: "Taylor",
    dm: "Melissa O'Connor",
    jobTitle: "Merchandiser",
    city: "Woodbury",
    state: "NJ",
    positionId: "p1",
    approvalPersistence: {
      simulatedOnly: true,
      p62RecruiterApproved: true,
      dmAssignmentApproved: true,
      p83AdvancementApproved: true,
      workflowStatus: "Paperwork Needed",
      actionType: "send-paperwork",
      detail: "test",
    },
    eligibilityResult: "eligible",
    sendBlockedReason: "Executive approval required",
    duplicateSendProtection: { passed: true, detail: null },
    liveSend: false,
    inSendQueue: true,
    safetyGates: [],
    executiveApprovalRequired: true,
    autoApproveBlocked: true,
  };
}

describe("approval-mode-production (P97)", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("never enables live paperwork sends by default", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("rejects empty candidateIds without auto-approval", async () => {
    await assert.rejects(
      () =>
        executeApprovalModePersistence({
          candidateIds: [],
          approvedBy: "Executive",
          approvedByUserId: "exec-1",
        }),
      /candidateIds required/,
    );
  });

  it("persists approved candidate with audit log and rollback artifact", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p97-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("SRS_CANDIDATE_WORKFLOW_DATA_DIR", tempDir);

    await upsertCandidateWorkflow({
      candidateId: "c-persist-1",
      workflowStatus: "Applied",
      assignedRecruiter: "Unassigned",
      assignedDM: "Unassigned",
    });

    await persistApprovedCandidate({
      sendEntry: sendEntry("c-persist-1"),
      existingWorkflow: (await getCandidateWorkflowState())["c-persist-1"],
      approvedBy: "Executive User",
      approvedByUserId: "exec-1",
    });

    const workflows = await getCandidateWorkflowState();
    assert.equal(workflows["c-persist-1"]?.workflowStatus, "Paperwork Needed");
    assert.equal(workflows["c-persist-1"]?.actionType, "send-paperwork");
    assert.equal(workflows["c-persist-1"]?.assignedRecruiter, "Taylor");

    const state = await loadP97State();
    assert.equal(state.persisted.length, 1);
    assert.equal(state.persisted[0]?.approvedBy, "Executive User");

    const rollback = await loadP97RollbackFile();
    assert.equal(rollback.entries.length, 1);
    assert.ok(rollback.entries[0]?.rollbackPlan.includes("Applied"));

    const auditRaw = await readFile(p97AuditLogPath(), "utf8");
    assert.ok(auditRaw.includes("c-persist-1"));
    assert.ok(auditRaw.includes("approval_persist"));
  });
});
