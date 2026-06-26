import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_P71_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { DEFAULT_P73_FEATURE_FLAGS } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { DEFAULT_P74_FEATURE_FLAGS } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { DEFAULT_P75_FEATURE_FLAGS } from "@/lib/autonomous-operations-center/feature-flags-store";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildAutonomousDecisionEngineDashboard,
  canExecuteDecisionEngine,
  DEFAULT_P76_FEATURE_FLAGS,
  generateAutonomousDecisions,
  runAutonomousDecisionEnginePreview,
  simulateDecisionPreview,
} from "@/lib/autonomous-decision-engine";
import { buildAutonomousOperationsCenterDashboard } from "@/lib/autonomous-operations-center";
import { buildAutonomousRecruitingOrchestratorDashboard } from "@/lib/autonomous-recruiting-orchestrator";
import { buildCandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/build-candidate-orchestration";

const REFERENCE = "2026-06-26T15:00:00.000Z";
const previewP73 = { ...DEFAULT_P73_FEATURE_FLAGS, communicationEnabled: true, executionMode: "preview" as const };
const previewP74 = { ...DEFAULT_P74_FEATURE_FLAGS, orchestratorEnabled: true, executionMode: "preview" as const };
const previewP75 = { ...DEFAULT_P75_FEATURE_FLAGS, operationsCenterEnabled: true, executionMode: "preview" as const };
const previewP76 = { ...DEFAULT_P76_FEATURE_FLAGS, decisionEngineEnabled: true, executionMode: "preview" as const };

function breezyCandidate(overrides: Partial<BreezyCandidate> & { candidateId: string }): BreezyCandidate {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    appliedDate: "2026-06-10T10:00:00.000Z",
    addedDate: "2026-06-10T10:00:00.000Z",
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
    phone: "",
    source: "Indeed",
    stage: "Applied",
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
    aiGrade: "B",
    workflowStatus: "Paperwork Sent",
    paperworkStatus: "sent",
    paperworkSentAt: "2026-06-12T10:00:00.000Z",
    appliedDate: "2026-06-10T10:00:00.000Z",
    lastActionAt: "2026-06-12T10:00:00.000Z",
    history: [],
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

describe("autonomous-decision-engine", () => {
  it("generates decisions with required explainability fields", () => {
    const rows = [workflowRow({ candidateId: "c-1", email: "" })];
    const operations = buildAutonomousOperationsCenterDashboard({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: rows,
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p74Flags: previewP74,
      p75Flags: previewP75,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });
    const orchestrator = buildAutonomousRecruitingOrchestratorDashboard({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: rows,
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p74Flags: previewP74,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });
    const orchestrations = rows.map((row) =>
      buildCandidateOrchestrationSnapshot({
        row,
        onboarding: null,
        policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
        referenceMs: Date.parse(REFERENCE),
      }),
    );

    const decisions = generateAutonomousDecisions({ orchestrations, operations, orchestrator });
    assert.ok(decisions.length > 0);
    const first = decisions[0];
    assert.ok(first.decision);
    assert.ok(first.reason);
    assert.ok(first.confidence >= 0 && first.confidence <= 100);
    assert.ok(first.requiredEngine);
    assert.ok(first.executiveExplanation);
  });

  it("blocks production execution by default", () => {
    assert.equal(canExecuteDecisionEngine(DEFAULT_P76_FEATURE_FLAGS), false);
  });

  it("builds decision dashboard with executive metrics", () => {
    const rows = [workflowRow({ candidateId: "c-1" })];
    const dashboard = buildAutonomousDecisionEngineDashboard({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: rows,
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p74Flags: previewP74,
      p75Flags: previewP75,
      p76Flags: previewP76,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(dashboard.previewMode, true);
    assert.ok(dashboard.recommendedDecisions.length > 0);
    assert.ok(dashboard.executiveMetrics.totalDecisions > 0);
    assert.ok(dashboard.warnings.length > 0);
  });

  it("simulates decisions without production side effects", () => {
    const rows = [workflowRow({ candidateId: "c-1" })];
    const dashboard = buildAutonomousDecisionEngineDashboard({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: rows,
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p74Flags: previewP74,
      p75Flags: previewP75,
      p76Flags: previewP76,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    const decision = dashboard.recommendedDecisions[0];
    const simulation = simulateDecisionPreview(decision);
    assert.equal(simulation.previewOnly, true);
    assert.equal(simulation.simulated, true);
    assert.ok(simulation.wouldNotExecute.some((s) => s.includes("No email")));
  });

  it("runs preview without production writes", () => {
    const result = runAutonomousDecisionEnginePreview({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: [workflowRow({ candidateId: "c-1" })],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p74Flags: previewP74,
      p75Flags: previewP75,
      p76Flags: previewP76,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.previewMode, true);
    assert.ok(result.dashboard.executiveMetrics.totalDecisions > 0);
  });
});
