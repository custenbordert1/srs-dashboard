import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  getP158MaxAssignmentsPerRun,
  isP158AutomaticAssignmentsEnabled,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import {
  resolveP158AssignmentStatus,
  shouldSkipExistingRecruiter,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-rules";
import { computeP158AssignmentConfidence } from "@/lib/p158-autonomous-recruiter-assignment/confidence-score";
import { pickNextAssignable } from "@/lib/p158-autonomous-recruiter-assignment/recommendation-builder";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { RecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/types";
import type { RecruiterAssignmentCandidateRow } from "@/lib/p151-autonomous-recruiter-assignment/types";

function wf(recruiter = "Unassigned"): CandidateWorkflowRecord {
  return {
    candidateId: "c1",
    workflowStatus: "Applied",
    assignedRecruiter: recruiter,
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "none",
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkSignedAt: null,
    paperworkError: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: new Date().toISOString(),
  };
}

function evaluation(overrides: Partial<RecruiterAssignmentCandidateRow> = {}): RecruiterAssignmentCandidateRow {
  return {
    candidateId: "c1",
    candidateName: "Test Candidate",
    cityState: "Austin, TX",
    zip: "78701",
    distanceMiles: 10,
    dmTerritory: "DM Texas",
    recruiterTerritory: "TX",
    assignedRecruiter: "Unassigned",
    recommendedRecruiter: "Alex",
    assignmentConfidence: 85,
    advancementConfidence: 70,
    operationalFitScore: 80,
    coveragePressure: 60,
    duplicateStatus: false,
    recommendation: "Assign Recruiter",
    autoAssignEligible: true,
    reason: "Territory match",
    blockers: [],
    assignmentReason: "Territory TX — Alex selected",
    ...overrides,
  };
}

function assignment(overrides: Partial<RecruiterAssignmentDecision> = {}): RecruiterAssignmentDecision {
  return {
    candidateId: "c1",
    recruiter: "Alex",
    confidence: 85,
    reason: "Territory TX — Alex selected",
    territoryState: "TX",
    dmName: "DM Texas",
    shouldAssign: true,
    ...overrides,
  };
}

describe("P158 autonomous recruiter assignment", () => {
  it("production disabled by default", () => {
    assert.equal(isP158AutomaticAssignmentsEnabled({}), false);
    assert.equal(isP158AutomaticAssignmentsEnabled({ P158_AUTOMATIC_ASSIGNMENTS_ENABLED: "false" }), false);
    assert.equal(isP158AutomaticAssignmentsEnabled({ P158_AUTOMATIC_ASSIGNMENTS_ENABLED: "true" }), true);
  });

  it("never skips manual recruiter assignments for overwrite", () => {
    const manual = wf("Alex");
    manual.recruiterAssignmentSource = "manual";
    assert.equal(shouldSkipExistingRecruiter(manual), true);
    assert.equal(shouldSkipExistingRecruiter(wf("Alex")), true);
    assert.equal(shouldSkipExistingRecruiter(wf("Unassigned")), false);
  });

  it("queues high-confidence unassigned candidates", () => {
    const result = resolveP158AssignmentStatus({
      workflow: wf("Unassigned"),
      evaluation: evaluation(),
      assignment: assignment(),
      duplicateInAudit: false,
    });
    assert.equal(result.status, "queued");
  });

  it("blocks duplicate audit assignments", () => {
    const result = resolveP158AssignmentStatus({
      workflow: wf("Unassigned"),
      evaluation: evaluation(),
      assignment: assignment(),
      duplicateInAudit: true,
    });
    assert.equal(result.status, "blocked");
  });

  it("confidence stays within 0-100", () => {
    const score = computeP158AssignmentConfidence({
      baseConfidence: 85,
      priorityScore: 90,
      openDemand: 40,
      recruiterWorkload: 5,
      stateOwned: 2,
    });
    assert.ok(score >= 0 && score <= 100);
  });

  it("pickNextAssignable respects duplicate protection", () => {
    const items: P158AssignmentQueueItem[] = [
      {
        candidateId: "c1",
        candidateName: "A",
        email: null,
        state: "TX",
        territory: "TX",
        dm: "DM Texas",
        position: "Merch",
        assignedRecruiter: "Unassigned",
        recommendedRecruiter: "Alex",
        confidence: 90,
        priorityScore: 80,
        openDemand: 20,
        recruiterWorkload: 3,
        status: "queued",
        reasoning: [],
        skipReason: null,
        duplicateRisk: false,
      },
      {
        candidateId: "c2",
        candidateName: "B",
        email: null,
        state: "TX",
        territory: "TX",
        dm: "DM Texas",
        position: "Merch",
        assignedRecruiter: "Unassigned",
        recommendedRecruiter: "Alex",
        confidence: 95,
        priorityScore: 85,
        openDemand: 20,
        recruiterWorkload: 3,
        status: "queued",
        reasoning: [],
        skipReason: null,
        duplicateRisk: true,
      },
    ];
    const next = pickNextAssignable(items, new Set());
    assert.equal(next?.candidateId, "c1");
  });

  it("reads max assignments from env", () => {
    assert.equal(getP158MaxAssignmentsPerRun({}), 25);
    assert.equal(getP158MaxAssignmentsPerRun({ P158_MAX_ASSIGNMENTS_PER_RUN: "10" }), 10);
  });
});
