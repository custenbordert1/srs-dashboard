import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import {
  getP152MaxSendsPerCycle,
  isP152ImmediatePaperworkEnabled,
} from "@/lib/p152-immediate-paperwork-policy/execute-immediate-paperwork-policy";
import { P152_BYPASSED_RULES } from "@/lib/p152-immediate-paperwork-policy/detect-legacy-paperwork-blockers";
import { P152_DEFAULT_MAX_SENDS } from "@/lib/p152-immediate-paperwork-policy/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate } from "@/lib/breezy-api";

function mockRow(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: "c1",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    assignedRecruiter: "Taylor",
    workflowStatus: "Applied",
    paperworkStatus: "none",
    stage: "Applied",
    hasResume: false,
    signatureRequestId: null,
    notes: [],
    candidateGrade: { gradeContributors: [], grade: "C", confidence: "medium", strengths: [], concerns: [] },
    questionnaireIntelligence: { available: false, techReady: null },
    resumeIntelligence: { signalBadges: [], relevantSkills: [] },
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

const candidate = { candidateId: "c1", email: "test@example.com" } as BreezyCandidate;

describe("P152 immediate paperwork policy", () => {
  it("is disabled by default", () => {
    assert.equal(isP152ImmediatePaperworkEnabled({}), false);
    assert.equal(isP152ImmediatePaperworkEnabled({ P152_IMMEDIATE_PAPERWORK_ENABLED: "true" }), true);
  });

  it("defaults max sends to 10", () => {
    assert.equal(getP152MaxSendsPerCycle({}), P152_DEFAULT_MAX_SENDS);
    assert.equal(getP152MaxSendsPerCycle({ P152_MAX_SENDS_PER_CYCLE: "5" }), 5);
  });

  it("blocks unassigned recruiter", () => {
    const result = detectImmediatePaperworkHardBlockers({
      row: mockRow({ assignedRecruiter: "Unassigned" }),
      candidate,
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.blocked, true);
    assert.equal(result.primaryHardBlocker, "unassigned_recruiter");
  });

  it("allows assigned recruiter without resume when no hard blockers", () => {
    const result = detectImmediatePaperworkHardBlockers({
      row: mockRow({ hasResume: false }),
      candidate,
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.blocked, false);
  });

  it("blocks duplicate candidates", () => {
    const result = detectImmediatePaperworkHardBlockers({
      row: mockRow({ notes: ["duplicate candidate"] }),
      candidate,
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.blocked, true);
    assert.equal(result.primaryHardBlocker, "duplicate_candidate");
  });

  it("documents bypassed legacy rules", () => {
    assert.ok(P152_BYPASSED_RULES.some((rule) => rule.includes("requireApproval")));
    assert.ok(P152_BYPASSED_RULES.some((rule) => rule.includes("Paperwork Needed")));
  });
});
