import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { buildSystemPilotSafetyChecks } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-safety-gates";
import {
  P122_CONFIRMATION_PHRASE,
  type PilotConfig,
} from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { runControlledLivePaperworkPilot } from "@/lib/p122-controlled-live-paperwork-pilot/run-controlled-live-pilot";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import type { ControlledLiveSendResult } from "@/lib/controlled-live-send/types";

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

function enabledConfig(allowlist: string[]): PilotConfig {
  return {
    pilotEnabled: true,
    liveModeEnabled: true,
    operatorGo: true,
    maxSends: 1,
    allowlist,
  };
}

function baseRow(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: "c-pilot-1",
    firstName: "Pilot",
    lastName: "Candidate",
    email: "pilot@example.com",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
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
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

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

describe("p122-controlled-live-paperwork-pilot", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("default mode sends nothing", async () => {
    const result = await runControlledLivePaperworkPilot({ dryRun: true });
    assert.equal(result.executedMode, "dryRun");
    assert.equal(result.sendResult.outcome, "not_executed");
    assert.equal(result.executeBatchCalled, false);
  });

  it("pilot disabled sends nothing", async () => {
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "false");
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "true");
    setEnv("AUTONOMOUS_PAPERWORK_OPERATOR_GO", "true");
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST", "c-pilot-1");

    const checks = buildSystemPilotSafetyChecks({
      config: loadPilotConfig(),
      pilotSendCount: 0,
      dryRun: false,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
    });
    assert.equal(checks.find((check) => check.id === "pilot_enabled")?.passed, false);

    const result = await runControlledLivePaperworkPilot({
      dryRun: false,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
      candidateId: "c-pilot-1",
    });
    assert.equal(result.executedMode, "none");
    assert.equal(result.sendResult.outcome, "not_executed");
  });

  it("live mode disabled sends nothing", () => {
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "true");
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "false");
    setEnv("AUTONOMOUS_PAPERWORK_OPERATOR_GO", "true");

    const checks = buildSystemPilotSafetyChecks({
      config: loadPilotConfig(),
      pilotSendCount: 0,
      dryRun: false,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
    });
    assert.equal(checks.find((check) => check.id === "live_mode_enabled")?.passed, false);
  });

  it("operator GO missing sends nothing", () => {
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "true");
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_MODE", "true");
    setEnv("AUTONOMOUS_PAPERWORK_OPERATOR_GO", "false");

    const checks = buildSystemPilotSafetyChecks({
      config: loadPilotConfig(),
      pilotSendCount: 0,
      dryRun: false,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
    });
    assert.equal(checks.find((check) => check.id === "operator_go")?.passed, false);
  });

  it("wrong confirmation phrase sends nothing", () => {
    const checks = buildSystemPilotSafetyChecks({
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 0,
      dryRun: false,
      confirmationPhrase: "SEND ALL PACKETS",
    });
    assert.equal(checks.find((check) => check.id === "confirmation_phrase")?.passed, false);
  });

  it("non-allowlisted candidate sends nothing", () => {
    const evaluation = evaluatePilotCandidate({
      candidateId: "c-other",
      row: baseRow({ candidateId: "c-other" }),
      onboarding: null,
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      paperworkByGrade: {},
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      approvedMapping: null,
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 0,
    });
    assert.equal(evaluation.allowlisted, false);
    assert.equal(evaluation.status, "blocked");
  });

  it("already_sent blocks", () => {
    const evaluation = evaluatePilotCandidate({
      candidateId: "c-pilot-1",
      row: baseRow({ paperworkStatus: "sent", signatureRequestId: "sig-1" }),
      onboarding: null,
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      paperworkByGrade: {},
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      approvedMapping: null,
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 0,
    });
    assert.equal(
      evaluation.safetyChecks.find((check) => check.id === "not_already_sent")?.passed,
      false,
    );
    assert.equal(evaluation.status, "blocked");
  });

  it("duplicate_risk blocks", () => {
    const evaluation = evaluatePilotCandidate({
      candidateId: "c-pilot-1",
      row: baseRow(),
      onboarding: {
        onboardingId: "onb-1",
        candidateId: "c-pilot-1",
        status: "sent",
        paperworkComplete: false,
        readyForMel: false,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        escalated: false,
        statusHistory: [],
        signatureRequestId: "sig-active",
      },
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      paperworkByGrade: {},
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      approvedMapping: null,
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 0,
    });
    assert.equal(
      evaluation.safetyChecks.find((check) => check.id === "no_duplicate_risk")?.passed,
      false,
    );
  });

  it("invalid_email blocks", () => {
    const evaluation = evaluatePilotCandidate({
      candidateId: "c-pilot-1",
      row: baseRow({ email: "not-an-email" }),
      onboarding: null,
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      paperworkByGrade: {},
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      approvedMapping: null,
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 0,
    });
    assert.equal(evaluation.safetyChecks.find((check) => check.id === "valid_email")?.passed, false);
  });

  it("executeBatch is never called and executeOne is called at most once", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p122-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    let executeOneCalls = 0;
    let executeBatchCalls = 0;

    const readyCandidate = evaluatePilotCandidate({
      candidateId: "c-pilot-1",
      row: baseRow(),
      onboarding: null,
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      paperworkByGrade: {},
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      approvedMapping: null,
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 0,
    });

    const mockExecute = async (input: { mode?: string; candidateId?: string }) => {
      if (input.mode === "executeBatch") executeBatchCalls += 1;
      if (input.mode === "executeOne") executeOneCalls += 1;
      return {
        ok: true,
        mode: input.mode ?? "executeOne",
        stoppedEarly: false,
        stopReason: null,
        executed: [
          {
            id: "audit-1",
            at: new Date().toISOString(),
            phase: "P100",
            mode: "executeOne",
            candidateId: input.candidateId ?? "c-pilot-1",
            candidateName: "Pilot Candidate",
            outcome: "sent",
            beforeState: {
              workflowStatus: "Paperwork Needed",
              actionType: "send-paperwork",
              paperworkStatus: "not_sent",
              signatureRequestId: null,
            },
            signatureRequestId: "dropbox-sign-123",
            simulated: false,
          },
        ],
        report: {} as ControlledLiveSendResult["report"],
        warnings: [],
      } satisfies ControlledLiveSendResult;
    };

    await runControlledLivePaperworkPilot({
      dryRun: false,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
      candidateId: "c-pilot-1",
      executeLiveSend: mockExecute as never,
      reportOverride: {
        sourcePhase: "P122",
        generatedAt: new Date().toISOString(),
        pilotConfig: enabledConfig(["c-pilot-1"]),
        requiredConfirmationPhrase: P122_CONFIRMATION_PHRASE,
        systemSafetyChecks: buildSystemPilotSafetyChecks({
          config: enabledConfig(["c-pilot-1"]),
          pilotSendCount: 0,
          dryRun: false,
          confirmationPhrase: P122_CONFIRMATION_PHRASE,
        }),
        evaluatedCandidates: [readyCandidate],
        eligiblePilotCandidates: [readyCandidate],
        blockedCandidates: [],
        allowlistedCandidates: [readyCandidate],
        sendPacketPreview: {
          candidateId: "c-pilot-1",
          candidateName: "Pilot Candidate",
          candidateEmail: "pilot@example.com",
          jobOrProject: "Merchandiser (Dallas, TX)",
          paperworkTemplate: "onboarding_packet",
          safetyChecks: readyCandidate.safetyChecks,
          auditDestination: "/tmp/audit.jsonl",
        },
        sendResult: null,
        auditRecordPath: "/tmp/audit.jsonl",
        pilotRegistryPath: "/tmp/registry.json",
        goNoGo: "GO",
        goNoGoReason: "All pilot safety gates satisfied.",
        warnings: [],
      },
    });

    assert.equal(executeBatchCalls, 0);
    assert.equal(executeOneCalls, 1);
  });

  it("pilot cap is enforced", () => {
    const evaluation = evaluatePilotCandidate({
      candidateId: "c-pilot-1",
      row: baseRow(),
      onboarding: null,
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      paperworkByGrade: {},
      p100SentIds: new Set(),
      pilotSentIds: new Set(["c-pilot-1"]),
      approvedMapping: null,
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 1,
    });
    assert.equal(
      evaluation.safetyChecks.find((check) => check.id === "pilot_cap_available")?.passed,
      false,
    );
  });

  it("audit record written after successful mock send", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p122-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const readyCandidate = evaluatePilotCandidate({
      candidateId: "c-pilot-1",
      row: baseRow(),
      onboarding: null,
      jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
      closedJobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      paperworkByGrade: {},
      p100SentIds: new Set(),
      pilotSentIds: new Set(),
      approvedMapping: null,
      config: enabledConfig(["c-pilot-1"]),
      pilotSendCount: 0,
    });

    const mockExecute = async (input: { mode?: string; candidateId?: string }) => ({
      ok: true,
      mode: input.mode ?? "executeOne",
      stoppedEarly: false,
      stopReason: null,
      executed: [
        {
          id: "audit-xyz",
          at: new Date().toISOString(),
          phase: "P100",
          mode: "executeOne",
          candidateId: input.candidateId ?? "c-pilot-1",
          candidateName: "Pilot Candidate",
          outcome: "sent",
          beforeState: {
            workflowStatus: "Paperwork Needed",
            actionType: "send-paperwork",
            paperworkStatus: "not_sent",
            signatureRequestId: null,
          },
          signatureRequestId: "dropbox-sign-abc",
          simulated: false,
        },
      ],
      report: {} as ControlledLiveSendResult["report"],
      warnings: [],
    });

    const result = await runControlledLivePaperworkPilot({
      dryRun: false,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
      candidateId: "c-pilot-1",
      executeLiveSend: mockExecute as never,
      reportOverride: {
        sourcePhase: "P122",
        generatedAt: new Date().toISOString(),
        pilotConfig: enabledConfig(["c-pilot-1"]),
        requiredConfirmationPhrase: P122_CONFIRMATION_PHRASE,
        systemSafetyChecks: buildSystemPilotSafetyChecks({
          config: enabledConfig(["c-pilot-1"]),
          pilotSendCount: 0,
          dryRun: false,
          confirmationPhrase: P122_CONFIRMATION_PHRASE,
        }),
        evaluatedCandidates: [readyCandidate],
        eligiblePilotCandidates: [readyCandidate],
        blockedCandidates: [],
        allowlistedCandidates: [readyCandidate],
        sendPacketPreview: {
          candidateId: "c-pilot-1",
          candidateName: "Pilot Candidate",
          candidateEmail: "pilot@example.com",
          jobOrProject: "Merchandiser (Dallas, TX)",
          paperworkTemplate: "onboarding_packet",
          safetyChecks: readyCandidate.safetyChecks,
          auditDestination: "/tmp/audit.jsonl",
        },
        sendResult: null,
        auditRecordPath: "/tmp/audit.jsonl",
        pilotRegistryPath: "/tmp/registry.json",
        goNoGo: "GO",
        goNoGoReason: "All pilot safety gates satisfied.",
        warnings: [],
      },
    });

    const registry = await loadPilotSendRegistry();
    assert.equal(result.sendResult.outcome, "sent");
    assert.equal(registry.sendCount, 1);
    assert.equal(registry.sends[0]?.signatureRequestId, "dropbox-sign-abc");
    assert.equal(registry.sends[0]?.auditEntryId, "audit-xyz");
  });
});
