import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_P71_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { DEFAULT_P73_FEATURE_FLAGS } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildAutonomousRecruitingOrchestratorDashboard,
  buildCandidateOrchestrationSnapshot,
  canExecuteOrchestrator,
  DEFAULT_P74_FEATURE_FLAGS,
  runAutonomousRecruitingOrchestratorPreview,
} from "@/lib/autonomous-recruiting-orchestrator";

const REFERENCE = "2026-06-26T15:00:00.000Z";

function breezyCandidate(overrides: Partial<BreezyCandidate> & { candidateId: string }): BreezyCandidate {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-26T10:00:00.000Z",
    addedDate: "2026-06-26T10:00:00.000Z",
    positionName: "Merchandiser",
    city: "Indianapolis",
    state: "IN",
    positionId: "pos-1",
    jobId: "job-1",
    tags: [],
    customFields: [],
    resumeUrl: "",
    coverLetter: "",
    breezyScore: 0,
    ...overrides,
  };
}

function workflowRow(overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId: string }): ScoredCandidateWorkflowRow {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    assignedRecruiter: "Taylor",
    assignedDM: "Jordan DM",
    actionGeneratedAt: "2026-06-26T10:30:00.000Z",
    aiGrade: "B",
    workflowStatus: "Paperwork Sent",
    paperworkStatus: "sent",
    paperworkSentAt: "2026-06-25T10:00:00.000Z",
    paperworkSignedAt: null,
    appliedDate: "2026-06-26T10:00:00.000Z",
    history: [],
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

const previewP73Flags = { ...DEFAULT_P73_FEATURE_FLAGS, communicationEnabled: true, executionMode: "preview" as const };
const previewP74Flags = { ...DEFAULT_P74_FEATURE_FLAGS, orchestratorEnabled: true, executionMode: "preview" as const };

describe("autonomous-recruiting-orchestrator", () => {
  it("builds explainable candidate orchestration", () => {
    const row = workflowRow({ candidateId: "c-1" });
    const snapshot = buildCandidateOrchestrationSnapshot({
      row,
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      referenceMs: Date.parse(REFERENCE),
    });

    assert.equal(snapshot.candidateId, "c-1");
    assert.ok(snapshot.nextAction.length > 0);
    assert.ok(snapshot.automationEligibilityReason.length > 0);
    assert.ok(["communication", "paperwork", "onboarding"].includes(snapshot.workflowStage));
  });

  it("blocks production execution by default", () => {
    assert.equal(canExecuteOrchestrator(DEFAULT_P74_FEATURE_FLAGS), false);
  });

  it("builds orchestrator dashboard with cross-engine health", () => {
    const candidates = [breezyCandidate({ candidateId: "c-1" })];
    const rows = [workflowRow({ candidateId: "c-1" })];

    const dashboard = buildAutonomousRecruitingOrchestratorDashboard({
      candidates,
      workflowRows: rows,
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73Flags,
      p74Flags: previewP74Flags,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(dashboard.previewMode, true);
    assert.equal(dashboard.engineHealth.length, 6);
    assert.ok(dashboard.readinessScore.overall >= 0);
    assert.ok(dashboard.lifecycleFlow.length >= 8);
    assert.ok(dashboard.warnings.some((w) => /preview mode/i.test(w)));
  });

  it("runs preview without production execution", () => {
    const result = runAutonomousRecruitingOrchestratorPreview({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: [workflowRow({ candidateId: "c-1" })],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73Flags,
      p74Flags: previewP74Flags,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.previewMode, true);
    assert.ok(result.dashboard.executiveMetrics.readyForExecution >= 0);
  });
});
