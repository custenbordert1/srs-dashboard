import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildAutonomousPaperworkSchedulerReport } from "@/lib/p136-autonomous-paperwork-scheduler/build-scheduler-report";
import { runSchedulerCycle, PHASES } from "@/lib/p136-autonomous-paperwork-scheduler/run-scheduler-cycle";
import {
  pauseScheduler,
  resumeScheduler,
  startScheduler,
  stopScheduler,
} from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-controls";
import { loadSchedulerState } from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";

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

function mockContext() {
  const row = {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Pilot",
    email: "alex@example.com",
    positionId: "job-1",
    positionName: "Merchandiser",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    assignedRecruiter: "Taylor",
    hasResume: true,
    candidateGrade: { paperworkReady: true },
    paperworkTemplateKey: "onboarding_packet",
    createdDate: new Date().toISOString(),
  } as ScoredCandidateWorkflowRow;

  const job = {
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

  return {
    rowsByCandidateId: new Map([[row.candidateId, row]]),
    jobsByPositionId: new Map([[job.jobId, job]]),
    closedJobsByPositionId: new Map(),
    publishedJobs: [job],
    publishedJobTitleById: new Map([[job.jobId, job.name]]),
    onboardingByCandidateId: new Map(),
    p109ByCandidate: new Map(),
    approvedMappingsByCandidate: new Map(),
    p100SentIds: new Set(),
    pilotSentIds: new Set(),
    candidateIds: [row.candidateId],
  };
}

describe("p136-autonomous-paperwork-scheduler", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("defines orchestration phase order", () => {
    assert.equal(PHASES[0], "refresh_candidate_data");
    assert.equal(PHASES[1], "remediation_executor_preview");
    assert.equal(PHASES[PHASES.length - 1], "sleep");
    assert.equal(PHASES.length, 9);
  });

  it("runs preview cycle without Breezy writes or sends", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p136-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");

    const context = mockContext();
    const cycle = await runSchedulerCycle({
      mode: "oneCycle",
      maxRemediationCandidates: 1,
      skipOpsCenter: true,
      loadCandidates: async () => context,
      runPaperworkCycleFn: async () =>
        ({
          report: {
            sendQueue: {
              nextCandidate: {
                candidateId: "c1",
                candidateName: "Alex Pilot",
                approvalDecision: "AUTO_APPROVED",
                approvalScore: 95,
                safeToSend: true,
              },
              nextFive: [],
              remainingQueue: [
                {
                  candidateId: "c1",
                  candidateName: "Alex Pilot",
                  approvalDecision: "AUTO_APPROVED",
                  approvalScore: 95,
                  safeToSend: true,
                },
              ],
              queueDepth: 1,
              estimatedCompletionMinutes: 5,
            },
            currentStep: "Queue built",
          },
          executeBatchCalled: false,
        }) as never,
    });

    assert.equal(cycle.skippedPaused, false);
    assert.ok(cycle.phasesCompleted.includes("approval_engine"));
    assert.ok(cycle.phasesCompleted.includes("orchestrator"));
    assert.ok(cycle.phasesCompleted.includes("p122_readiness"));
    assert.equal(cycle.safetyStatus.breezyWrites, false);
    assert.equal(cycle.safetyStatus.paperworkSent, false);
    assert.equal(cycle.safetyStatus.executeBatchCalled, false);
    assert.equal(cycle.safetyStatus.p122Unchanged, true);
  });

  it("supports scheduler control modes", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p136-controls-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const started = await startScheduler({ mode: "continuous", intervalMs: 60_000 });
    assert.equal(started.schedulerMode, "continuous");
    assert.equal(started.continuousEnabled, true);

    const paused = await pauseScheduler();
    assert.equal(paused.schedulerMode, "paused");

    const resumed = await resumeScheduler();
    assert.equal(resumed.schedulerMode, "continuous");

    const stopped = await stopScheduler();
    assert.equal(stopped.schedulerMode, "stopped");
    assert.equal(stopped.continuousEnabled, false);

    const state = await loadSchedulerState();
    assert.equal(state.executeBatchCalled, false);
  });

  it("builds scheduler report with executive panel", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p136-report-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const report = await buildAutonomousPaperworkSchedulerReport();
    assert.equal(report.sourcePhase, "P136");
    assert.equal(report.mode, "previewOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.ok(report.executivePanel);
    assert.equal(report.executivePanel.safetyStatus.previewOnly, true);
  });
});
