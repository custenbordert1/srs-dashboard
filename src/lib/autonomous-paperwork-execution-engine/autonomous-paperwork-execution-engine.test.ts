import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import {
  buildPaperworkExecutionEligibility,
  buildPaperworkExecutionQueue,
  buildPaperworkRetryPlan,
  canExecutePaperwork,
  DEFAULT_P71_FEATURE_FLAGS,
  passesPilotFilters,
  resolveEffectiveExecutionMode,
  runPreExecutionSafetyChecks,
  simulateExecutionWorkflow,
} from "@/lib/autonomous-paperwork-execution-engine";

const REFERENCE = "2026-06-26T15:00:00.000Z";

function workflowRow(overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId: string }): ScoredCandidateWorkflowRow {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    assignedRecruiter: "Amy Harp",
    assignedDM: "DM South",
    city: "Houston",
    state: "TX",
    positionName: "Henkel Merchandiser",
    actionGeneratedAt: "2026-06-25T10:00:00.000Z",
    aiGrade: "B",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    paperworkSignedAt: null,
    paperworkError: null,
    signatureRequestId: null,
    actionType: "send-paperwork",
    paperworkTemplateKey: "onboarding_packet",
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

describe("autonomous-paperwork-execution-engine", () => {
  it("defaults to automation off and preview execution mode", () => {
    assert.equal(DEFAULT_P71_FEATURE_FLAGS.automationEnabled, false);
    assert.equal(DEFAULT_P71_FEATURE_FLAGS.executionMode, "preview");
    assert.equal(canExecutePaperwork(DEFAULT_P71_FEATURE_FLAGS), false);
  });

  it("blocks execution unless production flags are all enabled", () => {
    const flags = {
      ...DEFAULT_P71_FEATURE_FLAGS,
      automationEnabled: true,
      executionMode: "production" as const,
      dropboxExecution: true,
    };
    assert.equal(canExecutePaperwork(flags), true);
  });

  it("applies pilot filters by recruiter and market", () => {
    const row = workflowRow({ candidateId: "pilot-1" });
    const flags = {
      ...DEFAULT_P71_FEATURE_FLAGS,
      automationEnabled: true,
      executionMode: "pilot" as const,
      pilotRecruiters: ["Amy Harp"],
      pilotMarkets: [],
    };
    assert.equal(resolveEffectiveExecutionMode({ row, flags }), "pilot");
    assert.equal(passesPilotFilters({ row, flags }), true);

    const nonPilot = workflowRow({ candidateId: "other-1", assignedRecruiter: "Other" });
    assert.equal(resolveEffectiveExecutionMode({ row: nonPilot, flags }), "preview");
  });

  it("evaluates execution eligibility with visible blocking reasons", () => {
    const blocked = buildPaperworkExecutionEligibility({
      row: workflowRow({ candidateId: "ready-1" }),
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: DEFAULT_P71_FEATURE_FLAGS,
    });
    assert.equal(blocked.eligible, false);
    assert.ok(blocked.blockingReasons.some((reason) => /automation/i.test(reason)));

    const ready = buildPaperworkExecutionEligibility({
      row: workflowRow({ candidateId: "ready-2" }),
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: {
        ...DEFAULT_P71_FEATURE_FLAGS,
        automationEnabled: true,
        executionMode: "preview",
      },
    });
    assert.equal(ready.status, "ready_for_execution");
    assert.equal(ready.eligible, true);
  });

  it("runs pre-execution safety checks without allowing live sends in preview", () => {
    const row = workflowRow({ candidateId: "safe-1" });
    const safety = runPreExecutionSafetyChecks({
      row,
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: DEFAULT_P71_FEATURE_FLAGS,
    });
    assert.equal(safety.safe, false);
    assert.ok(safety.blockingReasons.some((reason) => /execution mode/i.test(reason)));
  });

  it("builds retry plan with three attempts for transient errors", () => {
    const retry = buildPaperworkRetryPlan({
      attemptNumber: 1,
      maxAttempts: 3,
      transient: true,
      baseBackoffMs: 30_000,
      referenceMs: Date.parse(REFERENCE),
    });
    assert.equal(retry.shouldRetry, true);
    assert.equal(retry.moveToFailedQueue, false);

    const exhausted = buildPaperworkRetryPlan({
      attemptNumber: 3,
      maxAttempts: 3,
      transient: true,
      baseBackoffMs: 30_000,
    });
    assert.equal(exhausted.moveToFailedQueue, true);
  });

  it("simulates execution workflow without external calls", () => {
    const result = simulateExecutionWorkflow({
      candidateId: "sim-1",
      candidateName: "Alex Rivera",
      templateLabel: "Onboarding Packet",
      executionMode: "preview",
      referenceMs: Date.parse(REFERENCE),
      wouldExecute: true,
      blockingReasons: [],
    });
    assert.ok(result.timeline.length >= 5);
    assert.ok(result.auditEvents.every((event) => event.simulated));
    assert.ok(result.timeline.some((step) => /simulated/i.test(step.detail ?? step.label)));
  });

  it("builds execution queue items with wouldExecute in preview mode", () => {
    const queue = buildPaperworkExecutionQueue({
      candidates: [workflowRow({ candidateId: "q-1" })],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: {
        ...DEFAULT_P71_FEATURE_FLAGS,
        automationEnabled: true,
        executionMode: "preview",
      },
      maxRetries: 3,
      referenceMs: Date.parse(REFERENCE),
    });
    assert.ok(queue.length >= 1);
    assert.equal(queue[0]?.wouldExecute, true);
    assert.equal(queue[0]?.templateKey, "onboarding_packet");
  });
});
