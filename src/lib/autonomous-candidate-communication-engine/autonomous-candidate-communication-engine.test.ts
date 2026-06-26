import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  COMMUNICATION_PREVIEW_TEMPLATES,
  buildAutonomousCandidateCommunicationDashboard,
  buildCandidateCommunicationPreview,
  buildCommunicationDecisionsForCandidate,
  canExecuteCommunication,
  DEFAULT_P73_FEATURE_FLAGS,
  renderPreviewTemplate,
  buildTemplateVariables,
  runAutonomousCandidateCommunicationPreview,
} from "@/lib/autonomous-candidate-communication-engine";

const REFERENCE = "2026-06-26T15:00:00.000Z";

function workflowRow(overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId: string }): ScoredCandidateWorkflowRow {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    appliedDate: "2026-06-26T10:00:00.000Z",
    assignedRecruiter: "Taylor",
    assignedDM: "Jordan DM",
    actionGeneratedAt: "2026-06-26T10:30:00.000Z",
    aiGrade: "B",
    workflowStatus: "Paperwork Sent",
    paperworkStatus: "sent",
    paperworkSentAt: "2026-06-25T10:00:00.000Z",
    paperworkSignedAt: null,
    positionName: "Merchandiser",
    city: "Indianapolis",
    state: "IN",
    history: [],
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

const previewFlags = {
  ...DEFAULT_P73_FEATURE_FLAGS,
  communicationEnabled: true,
  executionMode: "preview" as const,
};

describe("autonomous-candidate-communication-engine", () => {
  it("defines preview templates for all communication types", () => {
    assert.ok(COMMUNICATION_PREVIEW_TEMPLATES.length >= 20);
    const types = new Set(COMMUNICATION_PREVIEW_TEMPLATES.map((t) => t.communicationType));
    assert.ok(types.has("welcome_email"));
    assert.ok(types.has("paperwork_sent"));
    assert.ok(types.has("daily_communication_summary"));
  });

  it("renders template merge fields", () => {
    const row = workflowRow({ candidateId: "c-1" });
    const template = COMMUNICATION_PREVIEW_TEMPLATES.find((t) => t.templateId === "onboarding_welcome")!;
    const rendered = renderPreviewTemplate(template, buildTemplateVariables(row));
    assert.match(rendered.body, /Alex/);
    assert.match(rendered.subject, /Welcome/);
  });

  it("builds explainable decisions from workflow state", () => {
    const row = workflowRow({ candidateId: "c-1" });
    const decisions = buildCommunicationDecisionsForCandidate({
      row,
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: previewFlags,
      referenceMs: Date.parse(REFERENCE),
      fetchedAt: REFERENCE,
    });

    assert.ok(decisions.length > 0);
    assert.ok(decisions.every((d) => d.explanation.length > 0));
    assert.ok(decisions.some((d) => d.communicationType === "paperwork_sent"));
    assert.ok(decisions.some((d) => d.communicationType === "reminder_24h"));
  });

  it("blocks live execution by default", () => {
    assert.equal(canExecuteCommunication(DEFAULT_P73_FEATURE_FLAGS), false);
    assert.equal(canExecuteCommunication({ ...DEFAULT_P73_FEATURE_FLAGS, communicationEnabled: true, executionMode: "production", emailEnabled: true }), true);
  });

  it("builds dashboard with health metrics", () => {
    const rows = [
      workflowRow({ candidateId: "c-1" }),
      workflowRow({ candidateId: "c-2", paperworkSignedAt: "2026-06-26T11:00:00.000Z", paperworkStatus: "signed" }),
    ];

    const dashboard = buildAutonomousCandidateCommunicationDashboard({
      candidates: rows,
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: previewFlags,
      fetchedAt: REFERENCE,
    });

    assert.equal(dashboard.previewMode, true);
    assert.equal(dashboard.controls.previewOnly, true);
    assert.ok(dashboard.health.communicationsToday >= 0);
    assert.ok(dashboard.queue.length > 0);
    assert.ok(dashboard.warnings.some((w) => /preview mode/i.test(w)));
  });

  it("builds candidate timeline and audit trail", () => {
    const row = workflowRow({ candidateId: "c-1" });
    const preview = buildCandidateCommunicationPreview({
      row,
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: previewFlags,
      fetchedAt: REFERENCE,
    });

    assert.equal(preview.candidateId, "c-1");
    assert.ok(preview.timeline.length > 0);
    assert.ok(preview.audit.length > 0);
    assert.ok(preview.audit.every((e) => e.simulated));
  });

  it("runs preview without production writes", () => {
    const result = runAutonomousCandidateCommunicationPreview({
      candidates: [workflowRow({ candidateId: "c-1" })],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: previewFlags,
      fetchedAt: REFERENCE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.previewMode, true);
    assert.ok(result.dashboard.leadershipSummary.length > 0);
  });
});
