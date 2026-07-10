import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { evaluateP157ActionRule } from "@/lib/p157-recruiter-decision-engine/action-rules";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { computeDecisionConfidence } from "@/lib/p157-recruiter-decision-engine/confidence-score";
import {
  buildP157DecisionContext,
  decideCandidateAction,
} from "@/lib/p157-recruiter-decision-engine/decision-engine";
import type { P157DecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { parseP157DecisionFilters } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import type { P156PrioritizedCandidate } from "@/lib/p156-candidate-prioritization/types";
import type { TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";

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

function wf(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? "Paperwork Needed",
    assignedRecruiter: patch.assignedRecruiter ?? "Alex",
    assignedDM: patch.assignedDM ?? "DM Texas",
    notes: patch.notes ?? [],
    history: patch.history ?? [],
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? "Send paperwork",
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
    updatedAt: patch.updatedAt ?? new Date(REF).toISOString(),
  };
}

function priorityRow(id: string): P156PrioritizedCandidate {
  return {
    candidateId: id,
    candidateName: "Sam Chen",
    email: "sam@example.com",
    priorityScore: 82,
    priorityLevel: "high",
    reasoning: ["Urgent territory"],
    recommendedNextAction: "Send paperwork",
    recruiter: "Alex",
    dm: "DM Texas",
    position: "Merchandiser",
    positionId: "job-1",
    project: "Reset TX",
    territory: "TX",
    state: "TX",
    openDemand: 40,
    daysInPipeline: 5,
    workflowStatus: "Paperwork Needed",
    factorBreakdown: [],
  };
}

function testCohort(): P157DecisionCohort {
  const row = buildScoredWorkflowRow(sample("c1"), wf("c1"), {
    job: {
      jobId: "job-1",
      name: "Merchandiser",
      city: "Austin",
      state: "TX",
      zip: "78701",
      displayLocation: "Austin, TX",
      locationSource: "location",
      status: "published",
      createdDate: "2026-01-01",
      updatedDate: "2026-06-01",
    },
  });

  return {
    fetchedAt: new Date(REF).toISOString(),
    candidates: [row],
    onboardingRecords: [],
    coverageNeeds: [
      {
        territoryKey: "DM Texas",
        territoryLabel: "TX",
        dmName: "DM Texas",
        states: ["TX"],
        openCalls: 40,
        activeReps: 2,
        pipelineCandidates: 4,
        applicantCount: 6,
        coverageStatus: "Critical",
        coverageNeedScore: 90,
        drivers: [],
        recommendedAction: "Urgent",
      } satisfies TerritoryCoverageNeed,
    ],
    opportunities: [],
    jobsByPositionId: new Map(),
    warnings: [],
    auditEvents: [],
    candidatesById: new Map([[row.candidateId, sample("c1")]]),
  };
}

describe("P157 recruiter decision engine", () => {
  it("assigns exactly one action per candidate", () => {
    const row = buildScoredWorkflowRow(sample("c1"), wf("c1", { assignedRecruiter: "Unassigned" }));
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
      recruiterWorkload: 3,
      referenceMs: REF,
    });
    const rule = evaluateP157ActionRule({ row, ctx, paperworkStage: "awaitingRecruiterAction" });
    assert.equal(rule.action, "Assign Recruiter");
  });

  it("recommends send paperwork with high confidence when eligible", () => {
    const row = buildScoredWorkflowRow(sample("c1"), wf("c1"));
    const decision = decideCandidateAction({
      row,
      candidate: sample("c1"),
      onboarding: null,
      auditEvents: [],
      priority: priorityRow("c1"),
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

    assert.equal(decision.action, "Send Paperwork");
    assert.ok(decision.confidence >= 80 && decision.confidence <= 100);
    assert.ok(decision.reasoning.length > 0);
    assert.ok(decision.reasoning.some((r) => /paperwork|questionnaire|duplicate|project/i.test(r)));
  });

  it("detects duplicate candidates", () => {
    const row = buildScoredWorkflowRow(
      sample("dup"),
      wf("dup", { notes: ["Possible duplicate of prior applicant"] }),
    );
    const ctx = buildP157DecisionContext({
      row,
      candidate: sample("dup"),
      onboarding: null,
      auditEvents: [],
      scoringMeta: {
        openDemand: 0,
        coverageStatus: "Healthy",
        daysUntilProjectStart: null,
        projectName: null,
        jobStatus: "published",
        jobPublished: true,
      },
      recruiterWorkload: 1,
      referenceMs: REF,
    });
    const rule = evaluateP157ActionRule({ row, ctx, paperworkStage: null });
    assert.equal(rule.action, "Candidate Duplicate");
  });

  it("builds dashboard sections read-only", () => {
    const dashboard = buildDecisionDashboardFromCohort(testCohort());
    assert.equal(dashboard.readOnly, true);
    assert.equal(dashboard.sourcePhase, "P157");
    assert.ok(dashboard.sections.top25.length > 0);
    assert.ok(dashboard.distribution.length > 0);
    assert.equal(dashboard.decisions.length, 1);
  });

  it("parses API filters", () => {
    const filters = parseP157DecisionFilters(
      new URL("https://x.test/api?decision=Send%20Paperwork&confidenceMin=85&priorityMin=70"),
    );
    assert.equal(filters.decision, "Send Paperwork");
    assert.equal(filters.confidenceMin, 85);
    assert.equal(filters.priorityMin, 70);
  });

  it("confidence stays within 0-100", () => {
    const score = computeDecisionConfidence({
      action: "Send Paperwork",
      signals: [{ id: "a", label: "test", weight: 10 }],
      priorityScore: 90,
      paperworkEligible: true,
      recruiterAssigned: true,
      questionnaireComplete: true,
      noDuplicate: true,
      urgentProject: true,
    });
    assert.ok(score >= 0 && score <= 100);
  });
});
