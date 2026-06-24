import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import {
  DEFAULT_CANDIDATE_AUTOMATION_POLICY,
  buildCandidateAutomationHealth,
  listCandidateAutomationRuns,
  loadCandidateAutomationPolicy,
  recordCandidateAutomationRun,
  runCandidateAutomationEngine,
  saveCandidateAutomationPolicy,
} from "@/lib/candidate-automation-engine";
import { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion/build-capture-metrics";
import { emptyIngestionStore, mergeIngestedCandidates } from "@/lib/candidate-ingestion/ingestion-store";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

let isolation: IsolatedRecruitingDataHandle;

function mtdCandidate(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-20T10:00:00.000Z",
    createdDate: "2026-06-20T10:00:00.000Z",
    addedDate: "2026-06-20T10:00:00.000Z",
    updatedDate: "2026-06-20T10:00:00.000Z",
    addedDateSource: "creation_date",
    positionName: "Merchandiser",
    positionId: "pos-1",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "Retail merchandising",
    hasResume: true,
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: "Applied",
    notes: [],
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: "Unassigned",
    lastActionAt: null,
    nextActionNeeded: "Review",
    history: [],
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: "not_sent",
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    recruiterAssignmentSource: patch.recruiterAssignmentSource ?? "auto",
    requiredAction: patch.requiredAction ?? "Screen candidate",
    actionGeneratedAt: patch.actionGeneratedAt ?? "2026-06-24T00:00:00.000Z",
    recommendedStage: patch.recommendedStage ?? "Phone Screen",
    progressionGeneratedAt: patch.progressionGeneratedAt ?? "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    ...patch,
  };
}

function usableIngestionStore(candidates: BreezyCandidate[]): CandidateIngestionStoreFile {
  const merged = mergeIngestedCandidates(emptyIngestionStore(), candidates);
  return {
    ...merged.store,
    publishedPositionsTotal: 10,
    scannedPositionIds: Array.from({ length: 10 }, (_, i) => `pos-${i}`),
    cycleComplete: true,
  };
}

async function seedIngestionStore(store: CandidateIngestionStoreFile): Promise<void> {
  const dir = isolation.dir;
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "candidate-ingestion.json"),
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8",
  );
}

before(async () => {
  isolation = await installIsolatedRecruitingDataDir("p65-automation-test-");
});

after(async () => {
  await isolation.restore();
});

describe("candidate-automation-engine", () => {
  it("loads and saves automation policy", async () => {
    const initial = await loadCandidateAutomationPolicy();
    assert.equal(initial.mode, DEFAULT_CANDIDATE_AUTOMATION_POLICY.mode);
    assert.equal(initial.assign.enabled, true);

    const saved = await saveCandidateAutomationPolicy({
      ...initial,
      paused: true,
      mode: "manual",
    });
    assert.equal(saved.paused, true);
    assert.equal(saved.mode, "manual");

    const reloaded = await loadCandidateAutomationPolicy();
    assert.equal(reloaded.paused, true);
    assert.equal(reloaded.mode, "manual");
  });

  it("records and lists automation runs newest-first", async () => {
    await recordCandidateAutomationRun({
      runId: "run-a",
      trigger: "api",
      startedAt: "2026-06-24T10:00:00.000Z",
      completedAt: "2026-06-24T10:00:01.000Z",
      durationMs: 1000,
      ok: true,
      skipped: false,
      mtdCandidatesProcessed: 5,
      p62Assigned: 2,
      p63ActionsGenerated: 3,
      p64ProgressionsGenerated: 1,
      p62CoveragePct: 80,
      p63CoveragePct: 70,
      p64CoveragePct: 60,
      candidatesAutoAssigned: 2,
      candidatesAutoActioned: 3,
      candidatesAutoProgressed: 1,
      manualInterventionRequired: 1,
      automationCompletionPct: 90,
      errors: [],
      warnings: [],
    });
    await recordCandidateAutomationRun({
      runId: "run-b",
      trigger: "ingestion",
      startedAt: "2026-06-24T11:00:00.000Z",
      completedAt: "2026-06-24T11:00:02.000Z",
      durationMs: 2000,
      ok: true,
      skipped: false,
      mtdCandidatesProcessed: 8,
      p62Assigned: 1,
      p63ActionsGenerated: 2,
      p64ProgressionsGenerated: 2,
      p62CoveragePct: 85,
      p63CoveragePct: 75,
      p64CoveragePct: 65,
      candidatesAutoAssigned: 1,
      candidatesAutoActioned: 2,
      candidatesAutoProgressed: 2,
      manualInterventionRequired: 2,
      automationCompletionPct: 88,
      errors: [],
      warnings: [],
    });

    const runs = await listCandidateAutomationRuns(5);
    assert.equal(runs.length, 2);
    assert.equal(runs[0]?.runId, "run-b");
    assert.equal(runs[1]?.runId, "run-a");
  });

  it("builds automation health from store, workflows, and runs", async () => {
    const store = usableIngestionStore([mtdCandidate("c-1"), mtdCandidate("c-2")]);
    const workflows = {
      "c-1": workflow("c-1"),
      "c-2": workflow("c-2", { assignedRecruiter: "Unassigned", recruiterAssignmentSource: "manual" }),
    };

    await recordCandidateAutomationRun({
      runId: "health-run",
      trigger: "manual",
      startedAt: "2026-06-24T12:00:00.000Z",
      completedAt: "2026-06-24T12:00:01.000Z",
      durationMs: 1000,
      ok: true,
      skipped: false,
      mtdCandidatesProcessed: 2,
      p62Assigned: 0,
      p63ActionsGenerated: 0,
      p64ProgressionsGenerated: 0,
      p62CoveragePct: 50,
      p63CoveragePct: 50,
      p64CoveragePct: 50,
      candidatesAutoAssigned: 1,
      candidatesAutoActioned: 1,
      candidatesAutoProgressed: 1,
      manualInterventionRequired: 1,
      automationCompletionPct: 75,
      errors: [],
      warnings: [],
    });

    const health = await buildCandidateAutomationHealth({
      store,
      workflows,
      jobsByPositionId: new Map(),
    });

    assert.equal(health.lastTrigger, "manual");
    assert.equal(health.lastRunOk, true);
    assert.equal(health.totalRuns, 3);
    assert.equal(health.candidatesAutoAssigned, 1);
    assert.equal(health.autoExecutions, 0);
    assert.equal(health.escalations, 0);
    assert.equal(health.rebalances, 0);

    const capture = buildApplicantCaptureHealth({ store, workflows, jobsByPositionId: new Map() });
    assert.equal(health.p62CoveragePct, capture.p62CoveragePct);
    assert.equal(health.p63CoveragePct, capture.p63CoveragePct);
    assert.equal(health.p64CoveragePct, capture.p64CoveragePct);
  });

  it("skips orchestrator when policy is paused", async () => {
    await seedIngestionStore(usableIngestionStore([mtdCandidate("c-paused")]));
    await saveCandidateAutomationPolicy({
      ...(await loadCandidateAutomationPolicy()),
      paused: true,
    });

    const before = (await listCandidateAutomationRuns(50)).length;
    const result = await runCandidateAutomationEngine({ trigger: "manual" });

    assert.equal(result.skipped, true);
    assert.match(result.skipReason ?? "", /paused/i);
    assert.equal(result.p62Assigned, 0);
    assert.equal(result.p63ActionsGenerated, 0);
    assert.equal(result.p64ProgressionsGenerated, 0);

    const after = await listCandidateAutomationRuns(50);
    assert.equal(after.length, before + 1);
    assert.equal(after[0]?.skipped, true);
  });

  it("skips orchestrator when no MTD candidates exist", async () => {
    await saveCandidateAutomationPolicy({
      ...(await loadCandidateAutomationPolicy()),
      paused: false,
    });
    await seedIngestionStore(usableIngestionStore([]));

    const result = await runCandidateAutomationEngine({ trigger: "api" });
    assert.equal(result.skipped, true);
    assert.match(result.skipReason ?? "", /No MTD candidates/i);
    assert.equal(result.mtdCandidatesProcessed, 0);
  });
});
