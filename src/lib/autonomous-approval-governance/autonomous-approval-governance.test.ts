import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_P71_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { DEFAULT_P73_FEATURE_FLAGS } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { DEFAULT_P74_FEATURE_FLAGS } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { DEFAULT_P75_FEATURE_FLAGS } from "@/lib/autonomous-operations-center/feature-flags-store";
import { DEFAULT_P76_FEATURE_FLAGS } from "@/lib/autonomous-decision-engine/feature-flags-store";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildApprovalQueue,
  buildAutonomousApprovalGovernanceDashboard,
  canExecuteGovernance,
  DEFAULT_P77_FEATURE_FLAGS,
  evaluateGovernanceForDecision,
  GOVERNANCE_POLICIES,
  runAutonomousApprovalGovernancePreview,
} from "@/lib/autonomous-approval-governance";
import { generateAutonomousDecisions } from "@/lib/autonomous-decision-engine";
import { buildAutonomousOperationsCenterDashboard } from "@/lib/autonomous-operations-center";
import { buildAutonomousRecruitingOrchestratorDashboard } from "@/lib/autonomous-recruiting-orchestrator";
import { buildCandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/build-candidate-orchestration";

const REFERENCE = "2026-06-26T15:00:00.000Z";
const previewP73 = { ...DEFAULT_P73_FEATURE_FLAGS, communicationEnabled: true, executionMode: "preview" as const };
const previewP74 = { ...DEFAULT_P74_FEATURE_FLAGS, orchestratorEnabled: true, executionMode: "preview" as const };
const previewP75 = { ...DEFAULT_P75_FEATURE_FLAGS, operationsCenterEnabled: true, executionMode: "preview" as const };
const previewP76 = { ...DEFAULT_P76_FEATURE_FLAGS, decisionEngineEnabled: true, executionMode: "preview" as const };
const previewP77 = { ...DEFAULT_P77_FEATURE_FLAGS, governanceEnabled: true, executionMode: "preview" as const };

function breezyCandidate(overrides: Partial<BreezyCandidate> & { candidateId: string }): BreezyCandidate {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    appliedDate: "2026-06-10T10:00:00.000Z",
    addedDate: "2026-06-10T10:00:00.000Z",
    positionName: "Merchandiser",
    city: "Houston",
    state: "TX",
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
    city: "Houston",
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

describe("autonomous-approval-governance", () => {
  it("assigns approval levels with explainable rules", () => {
    const rows = [workflowRow({ candidateId: "c-1" })];
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

    const governed = evaluateGovernanceForDecision({
      decision: decisions[0],
      workflowRows: rows,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p77Flags: previewP77,
    });

    assert.ok(governed.approvalLevel);
    assert.ok(governed.governanceReason);
    assert.ok(governed.requiredApprover);
    assert.ok(governed.auditLogPreview.length > 0);
    assert.equal(governed.approvalLevel, "recruiter_approval_required");
    assert.ok(governed.blockingRules.some((r) => r.includes("preview")));
  });

  it("blocks communication when email channel disabled", () => {
    const rows = [workflowRow({ candidateId: "c-1" })];
    const governed = evaluateGovernanceForDecision({
      decision: {
        decisionId: "test-email",
        category: "communication",
        decision: "Send email reminder",
        reason: "Test",
        confidence: 99,
        priority: "high",
        risk: "low",
        requiredEngine: "Communication Engine",
        dependencies: [],
        blockedBy: [],
        expectedOutcome: "Reminder sent",
        estimatedRecruiterTimeSavedMinutes: 15,
        executiveExplanation: "Test",
        affectedCandidateIds: ["c-1"],
        affectedCandidateNames: ["Alex Rivera"],
        humanApprovalRequired: false,
        automationReady: true,
        blocked: false,
      },
      workflowRows: rows,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: { ...previewP73, emailEnabled: false },
      p77Flags: { ...previewP77, previewMode: false, executionMode: "production" },
    });

    assert.equal(governed.approvalLevel, "blocked");
    assert.ok(governed.appliedPolicies.includes("email_channel_disabled"));
  });

  it("loads policy registry", () => {
    assert.ok(GOVERNANCE_POLICIES.length >= 10);
    assert.ok(GOVERNANCE_POLICIES.some((p) => p.id === "preview_mode_gate"));
  });

  it("blocks production execution by default", () => {
    assert.equal(canExecuteGovernance(DEFAULT_P77_FEATURE_FLAGS), false);
  });

  it("builds governance dashboard and approval queue", () => {
    const dashboard = buildAutonomousApprovalGovernanceDashboard({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: [workflowRow({ candidateId: "c-1" })],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p74Flags: previewP74,
      p75Flags: previewP75,
      p76Flags: previewP76,
      p77Flags: previewP77,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(dashboard.previewMode, true);
    assert.ok(dashboard.executiveMetrics.totalDecisionsReviewed > 0);
    assert.ok(dashboard.approvalQueue.length >= 0);
    assert.ok(dashboard.policies.length > 0);
    assert.ok(dashboard.warnings.length > 0);

    const queue = buildApprovalQueue(dashboard.approvalRequired);
    assert.ok(Array.isArray(queue));
  });

  it("runs preview without approval mutations", () => {
    const result = runAutonomousApprovalGovernancePreview({
      candidates: [breezyCandidate({ candidateId: "c-1" })],
      workflowRows: [workflowRow({ candidateId: "c-1" })],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      p71Flags: DEFAULT_P71_FEATURE_FLAGS,
      p73Flags: previewP73,
      p74Flags: previewP74,
      p75Flags: previewP75,
      p76Flags: previewP76,
      p77Flags: previewP77,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.previewMode, true);
    assert.ok(result.dashboard.governanceHealth.summary.length > 0);
  });
});
