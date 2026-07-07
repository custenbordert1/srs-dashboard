import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { classifyBlocker, isAutomatableBlocker } from "@/lib/p158-post-assignment-outcome-diagnosis/classify-blocker";
import { diagnosePrimaryBlocker } from "@/lib/p158-post-assignment-outcome-diagnosis/diagnose-blocker";
import { buildDiagnosisSummary } from "@/lib/p158-post-assignment-outcome-diagnosis/diagnosis-summary";
import { P1582_SAFEST_NEXT_CHANGE, recommendFixForBlocker } from "@/lib/p158-post-assignment-outcome-diagnosis/recommend-fix";
import type { P1582CandidateDiagnosis } from "@/lib/p158-post-assignment-outcome-diagnosis/types";
import { buildP157DecisionContext } from "@/lib/p157-recruiter-decision-engine/decision-engine";

const REF = Date.parse("2026-06-15T12:00:00.000Z");

function sample(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Chen",
    email: "sam@example.com",
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-10",
    createdDate: "2026-06-10",
    addedDate: "2026-06-10",
    updatedDate: "2026-06-10",
    addedDateSource: "creation_date",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    resumeText: "",
    hasResume: true,
  };
}

function wf(patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "c1",
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: patch.assignedRecruiter ?? "Alex",
    assignedDM: patch.assignedDM ?? "DM Texas",
    notes: patch.notes ?? [],
    history: patch.history ?? [],
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? "Review",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    paperworkStatus: patch.paperworkStatus ?? "none",
    signatureRequestId: patch.signatureRequestId ?? null,
    paperworkTemplateKey: patch.paperworkTemplateKey ?? null,
    paperworkSentAt: patch.paperworkSentAt ?? null,
    paperworkSignedAt: patch.paperworkSignedAt ?? null,
    paperworkError: patch.paperworkError ?? null,
    directDepositStatus: patch.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: patch.directDepositRequestedAt ?? null,
    directDepositLastReminderAt: patch.directDepositLastReminderAt ?? null,
    directDepositNotes: patch.directDepositNotes ?? null,
    directDepositTriggeredByUserId: patch.directDepositTriggeredByUserId ?? null,
    directDepositLastDeliveryMode: patch.directDepositLastDeliveryMode ?? null,
    directDepositLastHrCopyIncluded: patch.directDepositLastHrCopyIncluded ?? null,
    directDepositLastHrBccAddress: patch.directDepositLastHrBccAddress ?? null,
    updatedAt: new Date(REF).toISOString(),
  };
}

describe("P158.2 blocker classification", () => {
  it("classifies workflow state as artificial gate and automatable", () => {
    const blockerClass = classifyBlocker("workflow_state_issue");
    assert.equal(blockerClass, "artificial_workflow_gate");
    assert.equal(isAutomatableBlocker("workflow_state_issue", blockerClass), true);
  });

  it("classifies duplicate as business requirement", () => {
    const blockerClass = classifyBlocker("duplicate");
    assert.equal(blockerClass, "true_business_requirement");
    assert.equal(isAutomatableBlocker("duplicate", blockerClass), false);
  });

  it("recommends fix for workflow gate", () => {
    assert.ok(recommendFixForBlocker("workflow_state_issue").includes("Paperwork Needed"));
    assert.ok(P1582_SAFEST_NEXT_CHANGE.includes("P158.3"));
  });
});

describe("P158.2 primary blocker diagnosis", () => {
  it("diagnoses workflow state issue for Applied + assigned recruiter", () => {
    const row = buildScoredWorkflowRow(sample("c1"), wf({ workflowStatus: "Applied", assignedRecruiter: "Alex" }));
    const ctx = buildP157DecisionContext({
      row,
      candidate: sample("c1"),
      onboarding: null,
      auditEvents: [],
      scoringMeta: {
        openDemand: 40,
        coverageStatus: "Critical",
        daysUntilProjectStart: 4,
        projectName: "Reset TX",
        jobStatus: "published",
        jobPublished: true,
      },
      recruiterWorkload: 2,
      referenceMs: REF,
    });

    const result = diagnosePrimaryBlocker({
      row,
      candidate: sample("c1"),
      ctx,
      paperworkStage: null,
      onboarding: null,
      auditEvents: [],
      jobsByPositionId: new Map(),
      referenceMs: REF,
      decisionConfidence: 70,
    });

    assert.equal(result.code, "workflow_state_issue");
    assert.ok(result.reason.includes("Paperwork Needed"));
  });

  it("diagnoses missing resume when no resume on file", () => {
    const breezy = { ...sample("c1"), hasResume: false, resumeText: "" };
    const row = buildScoredWorkflowRow(breezy, wf({ workflowStatus: "Paperwork Needed" }));
    const ctx = buildP157DecisionContext({
      row,
      candidate: breezy,
      onboarding: null,
      auditEvents: [],
      scoringMeta: {
        openDemand: 10,
        coverageStatus: "Healthy",
        daysUntilProjectStart: null,
        projectName: null,
        jobStatus: "published",
        jobPublished: true,
      },
      recruiterWorkload: 1,
      referenceMs: REF,
    });

    const result = diagnosePrimaryBlocker({
      row,
      candidate: breezy,
      ctx,
      paperworkStage: "awaitingRecruiterAction",
      onboarding: null,
      auditEvents: [],
      jobsByPositionId: new Map(),
      referenceMs: REF,
      decisionConfidence: 80,
    });

    assert.equal(result.code, "missing_resume");
  });
});

describe("P158.2 diagnosis summary", () => {
  it("aggregates blocker counts and paperwork lift", () => {
    const rows: P1582CandidateDiagnosis[] = [
      {
        candidateId: "c1",
        candidateName: "A",
        recruiter: "Alex",
        dm: "DM",
        postAssignmentAction: "Manual Review",
        confidence: 65,
        workflowStatus: "Applied",
        paperworkStage: null,
        primaryBlocker: "workflow_state_issue",
        blockerReason: "workflow gate",
        blockerClass: "artificial_workflow_gate",
        automatable: true,
        recommendedFix: "advance workflow",
        allBlockers: [],
        signals: [],
      },
      {
        candidateId: "c2",
        candidateName: "B",
        recruiter: "Taylor",
        dm: "DM",
        postAssignmentAction: "Manual Review",
        confidence: 55,
        workflowStatus: "Applied",
        paperworkStage: null,
        primaryBlocker: "missing_resume",
        blockerReason: "no resume",
        blockerClass: "remain_manual_review",
        automatable: false,
        recommendedFix: "request resume",
        allBlockers: [],
        signals: [],
      },
    ];

    const summary = buildDiagnosisSummary(rows);
    assert.equal(summary.candidatesDiagnosed, 2);
    assert.equal(summary.manualReviewCount, 2);
    assert.equal(summary.estimatedPaperworkLift, 1);
    assert.equal(summary.blockerCounts.find((b) => b.code === "workflow_state_issue")?.count, 1);
  });
});

describe("P158.2 read-only guarantees", () => {
  it("marks source phase P158.2", async () => {
    const mod = await import("@/lib/p158-post-assignment-outcome-diagnosis/types");
    assert.equal(mod.P158_2_SOURCE_PHASE, "P158.2");
  });
});
