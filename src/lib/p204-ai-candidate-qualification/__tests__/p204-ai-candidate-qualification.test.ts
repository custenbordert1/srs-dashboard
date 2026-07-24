import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildEmailDuplicateIndex,
  evaluateP204Qualification,
} from "@/lib/p204-ai-candidate-qualification/decide";

function candidate(partial: Partial<BreezyCandidate> & { candidateId: string }): BreezyCandidate {
  return {
    candidateId: partial.candidateId,
    firstName: partial.firstName ?? "Pat",
    lastName: partial.lastName ?? "Lee",
    email: partial.email ?? "pat.lee@example.com",
    phone: partial.phone ?? "5555551212",
    source: partial.source ?? "Indeed",
    stage: partial.stage ?? "applied",
    appliedDate: partial.appliedDate ?? "2026-07-10",
    createdDate: partial.createdDate ?? "2026-07-10",
    addedDate: partial.addedDate ?? "2026-07-10",
    updatedDate: partial.updatedDate ?? "2026-07-10",
    addedDateSource: "creation_date",
    positionId: partial.positionId ?? "pos-1",
    positionName: partial.positionName ?? "Merchandiser",
    city: partial.city ?? "Columbus",
    state: partial.state ?? "OH",
    zipCode: partial.zipCode ?? "43004",
    resumeText:
      partial.resumeText ??
      "5 years merchandising experience retail reset planogram travel vendor Walmart",
    hasResume: partial.hasResume ?? true,
    hasQuestionnaire: partial.hasQuestionnaire ?? true,
    questionnaireAnswers: partial.questionnaireAnswers ?? [
      { question: "Do you have a smartphone?", answer: "Yes, Android" },
      { question: "Transportation and age 18+?", answer: "Yes" },
      { question: "Independent contractor (1099)?", answer: "Count me in — 1099" },
      { question: "Merchandising experience", answer: "3-5 years" },
      { question: "Availability", answer: "Immediate / can travel" },
      { question: "Comfort installing apps", answer: "Yes" },
      { question: "Photo and survey capability", answer: "Yes" },
      { question: "Scheduling deadline acknowledgement", answer: "Yes" },
      { question: "Willingness to learn tools", answer: "Yes" },
      { question: "Daily email system check", answer: "Yes" },
      { question: "Physical capability", answer: "Yes" },
      { question: "Reliable smartphone internet", answer: "Yes" },
    ],
    score: partial.score,
  };
}

describe("P204 AI candidate qualification (read-only)", () => {
  it("detects duplicate emails", () => {
    const idx = buildEmailDuplicateIndex([
      candidate({ candidateId: "a", email: "shared@example.com" }),
      candidate({ candidateId: "b", email: "shared@example.com" }),
      candidate({ candidateId: "c", email: "unique@example.com" }),
    ]);
    assert.equal(idx.get("shared@example.com"), 2);
    assert.equal(idx.get("unique@example.com"), 1);
  });

  it("recommends review for thin signal candidates", () => {
    const thin = candidate({
      candidateId: "thin-1",
      resumeText: "",
      hasResume: false,
      hasQuestionnaire: false,
      questionnaireAnswers: [],
      email: "thin@example.com",
    });
    const row = buildScoredWorkflowRow(thin, {
      candidateId: "thin-1",
      workflowStatus: "Applied",
      assignedRecruiter: "Recruiting Team",
      assignedDM: "Unassigned",
      notes: [],
      history: [],
      updatedAt: "2026-07-15T00:00:00.000Z",
      lastActionAt: null,
      nextActionNeeded: "Review",
      paperworkStatus: "not_sent",
    } as never);
    const decision = evaluateP204Qualification({
      row,
      emailCounts: buildEmailDuplicateIndex([thin]),
    });
    assert.equal(decision.recommendation, "needs_recruiter_review");
    assert.ok(decision.confidence >= 0 && decision.confidence <= 100);
    assert.ok(decision.reasonCodes.length > 0);
    assert.ok(decision.recommendedNextAction.length > 0);
  });

  it("routes explicit gig opt-out toward reject", () => {
    const c = candidate({
      candidateId: "reject-1",
      email: "out@example.com",
      questionnaireAnswers: [
        { question: "Independent contractor?", answer: "Count me out — not what I thought" },
        { question: "Smartphone?", answer: "No" },
        { question: "Transportation?", answer: "No" },
      ],
    });
    const row = buildScoredWorkflowRow(c, {
      candidateId: "reject-1",
      workflowStatus: "Applied",
      assignedRecruiter: "Unassigned",
      assignedDM: "Unassigned",
      notes: [],
      history: [],
      updatedAt: "2026-07-15T00:00:00.000Z",
      lastActionAt: null,
      nextActionNeeded: "Review",
      paperworkStatus: "not_sent",
    } as never);
    const decision = evaluateP204Qualification({
      row,
      emailCounts: buildEmailDuplicateIndex([c]),
    });
    assert.ok(
      decision.recommendation === "reject" || decision.recommendation === "needs_recruiter_review",
    );
    assert.ok(
      decision.reasonCodes.includes("explicit_disqualify") ||
        decision.reasonCodes.includes("hard_gate_fail_closed_to_review") ||
        decision.components.p1934Decision !== "Qualified",
    );
  });

  it("never mutates recommendation without evidence package", () => {
    const c = candidate({ candidateId: "ev-1" });
    const row = buildScoredWorkflowRow(c, undefined, { job: null });
    // Force Applied status on scored row by patching after build
    const applied = { ...row, workflowStatus: "Applied" as const };
    const decision = evaluateP204Qualification({
      row: applied,
      emailCounts: buildEmailDuplicateIndex([c]),
    });
    assert.ok(Array.isArray(decision.evidence));
    assert.ok(decision.evidence.length >= 1);
    assert.match(decision.recommendedNextAction, /recruiter|Paperwork|reject/i);
  });
});
