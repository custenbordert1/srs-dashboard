import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_P71_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { DEFAULT_P73_FEATURE_FLAGS } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { DEFAULT_P74_FEATURE_FLAGS } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { DEFAULT_P75_FEATURE_FLAGS } from "@/lib/autonomous-operations-center/feature-flags-store";
import { DEFAULT_P76_FEATURE_FLAGS } from "@/lib/autonomous-decision-engine/feature-flags-store";
import { DEFAULT_P77_FEATURE_FLAGS } from "@/lib/autonomous-approval-governance/feature-flags-store";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildAiCommandResponse,
  buildCommandCenterChatContext,
  buildCommandCenterDashboard,
  buildExecutiveGreeting,
  canExecuteCommandCenter,
  createCommandCenterSession,
  DEFAULT_FOLLOW_UPS,
  DEFAULT_P78_FEATURE_FLAGS,
  resolveCommandCenterQuery,
  resolveFollowUpMessage,
  resetChatSession,
} from "@/lib/ai-command-center";
import { processCommandCenterChat } from "@/lib/ai-command-center/run-ai-command-center";

const REFERENCE = "2026-06-26T15:00:00.000Z";
const previewP73 = { ...DEFAULT_P73_FEATURE_FLAGS, communicationEnabled: true, executionMode: "preview" as const };
const previewP74 = { ...DEFAULT_P74_FEATURE_FLAGS, orchestratorEnabled: true, executionMode: "preview" as const };
const previewP75 = { ...DEFAULT_P75_FEATURE_FLAGS, operationsCenterEnabled: true, executionMode: "preview" as const };
const previewP76 = { ...DEFAULT_P76_FEATURE_FLAGS, decisionEngineEnabled: true, executionMode: "preview" as const };
const previewP77 = { ...DEFAULT_P77_FEATURE_FLAGS, governanceEnabled: true, executionMode: "preview" as const };
const previewP78 = { ...DEFAULT_P78_FEATURE_FLAGS, commandCenterEnabled: true, executionMode: "preview" as const };

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
    appliedDate: "2026-06-10T10:00:00.000Z",
    lastActionAt: "2026-06-12T10:00:00.000Z",
    history: [],
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

const sharedInput = {
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
  p78Flags: previewP78,
  sendQueueMetrics: null,
  fetchedAt: REFERENCE,
};

describe("ai-command-center", () => {
  it("resolves command center queries from natural language", () => {
    assert.equal(resolveCommandCenterQuery("What needs approval?"), "governance_requires_approval");
    assert.equal(resolveCommandCenterQuery("What is broken?"), "operations_anything_broken");
    assert.equal(resolveCommandCenterQuery("Show my biggest risks"), "operations_biggest_risk");
  });

  it("builds executive greeting with health and priorities", () => {
    const context = buildCommandCenterChatContext(sharedInput);
    const greeting = buildExecutiveGreeting(context, "Taylor");
    assert.ok(greeting.headline.includes("Taylor"));
    assert.ok(greeting.formattedText.includes("Recruiting Health"));
    assert.ok(greeting.formattedText.includes("How can I help?"));
  });

  it("builds chat context composing P72-P77 engines", () => {
    const context = buildCommandCenterChatContext(sharedInput);
    assert.ok(context.brief.summaryText);
    assert.ok(context.operations.platformHealth);
    assert.ok(context.decisions.executiveMetrics);
    assert.ok(context.governance.approvalQueue);
  });

  it("builds assistant responses with required fields", () => {
    const context = buildCommandCenterChatContext(sharedInput);
    const response = buildAiCommandResponse({
      message: "What requires approval?",
      context,
      answer: null,
      queryId: "governance_requires_approval",
    });
    assert.ok(response.summary);
    assert.ok(response.sourceEngines.length > 0);
    assert.ok(response.sourceAttributions.length > 0);
    assert.ok(response.followUpQuestions.length >= 3);
    assert.equal(response.previewOnly, true);
    assert.ok(response.dashboardLinks.length > 0);
    assert.ok("confidence" in response);
  });

  it("supports follow-up conversation memory", () => {
    const session = createCommandCenterSession();
    session.memory.lastSummary = "3 decisions require approval";
    session.memory.lastTopic = "approval queue";
    session.memory.lastCandidateNames = ["Alex Rivera"];
    const expanded = resolveFollowUpMessage("Why?", session.memory);
    assert.ok(expanded?.includes("Why"));
    const next = resolveFollowUpMessage("What happens next?", session.memory);
    assert.ok(next?.includes("next"));
    const candidateRef = resolveFollowUpMessage("that candidate", session.memory);
    assert.ok(candidateRef?.includes("Alex Rivera"));
    const storesRef = resolveFollowUpMessage("those stores", session.memory);
    assert.ok(storesRef?.includes("stores") || storesRef?.includes("risk"));
  });

  it("provides default follow-up prompts", () => {
    assert.ok(DEFAULT_FOLLOW_UPS.length >= 3);
    assert.ok(DEFAULT_FOLLOW_UPS.includes("Can this be automated?"));
  });

  it("blocks production execution by default", () => {
    assert.equal(canExecuteCommandCenter(DEFAULT_P78_FEATURE_FLAGS), false);
  });

  it("processes chat in preview without live execution", async () => {
    const session = createCommandCenterSession("test-session");
    await resetChatSession(session.sessionId);
    const result = await processCommandCenterChat({
      ...sharedInput,
      sessionId: session.sessionId,
      message: "What should the system do next?",
    });
    assert.equal(result.ok, true);
    assert.equal(result.previewMode, true);
    assert.ok(result.message.response?.summary);
    assert.ok(result.warnings.some((w) => w.includes("Preview")));
  });

  it("builds command center dashboard with suggested prompts", () => {
    const dashboard = buildCommandCenterDashboard({ ...sharedInput, sessionId: "dash-1", executiveFirstName: "Taylor" });
    assert.equal(dashboard.previewMode, true);
    assert.equal(dashboard.suggestedPrompts.length, 6);
    assert.ok(dashboard.greeting.length > 0);
    assert.ok(dashboard.executiveGreeting.headline.includes("Taylor"));
  });
});
