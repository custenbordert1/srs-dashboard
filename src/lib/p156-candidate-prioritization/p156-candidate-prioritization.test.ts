import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P156_FACTOR_WEIGHTS,
  assertP156WeightsSumTo100,
} from "@/lib/p156-candidate-prioritization/constants";
import {
  buildPrioritizedQueueFromCohort,
  parseP156QueueFilters,
} from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import type { P156PrioritizationCohort } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildPriorityExplanation } from "@/lib/p156-candidate-prioritization/explanation-generator";
import { scoreCandidatePriorityFactors } from "@/lib/p156-candidate-prioritization/scoring-engine";
import {
  computeWeightedPriorityScore,
  resolveP156PriorityLevel,
} from "@/lib/p156-candidate-prioritization/weighting-model";
import type { TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";

const REF = Date.parse("2026-06-15T12:00:00.000Z");

function sample(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-10",
    createdDate: "2026-06-10",
    addedDate: "2026-06-10",
    updatedDate: "2026-06-10",
    addedDateSource: "creation_date",
    positionId: "job-tx",
    positionName: "Merchandiser — Austin",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    resumeText: "",
    hasResume: false,
    ...patch,
  };
}

function wf(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? "Paperwork Needed",
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor Custenborder",
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

function criticalNeed(): TerritoryCoverageNeed {
  return {
    territoryKey: "DM Texas",
    territoryLabel: "TX",
    dmName: "DM Texas",
    states: ["TX"],
    openCalls: 42,
    activeReps: 2,
    pipelineCandidates: 3,
    applicantCount: 8,
    coverageStatus: "Critical",
    coverageNeedScore: 92,
    drivers: ["Open store calls exceed active reps"],
    recommendedAction: "Launch urgent posting",
  };
}

function buildTestCohort(): P156PrioritizationCohort {
  const row = buildScoredWorkflowRow(sample("c1"), wf("c1"), {
    job: {
      jobId: "job-tx",
      name: "Merchandiser — Austin",
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
  row.matchPercent = 88;
  row.distanceMiles = 12;
  row.aiGrade = "A";

  return {
    fetchedAt: new Date(REF).toISOString(),
    candidates: [row],
    onboardingRecords: [],
    coverageNeeds: [criticalNeed()],
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Walmart Reset TX",
        client: "Walmart",
        storeAddress: "123 Main",
        storeName: "Store 1",
        city: "Austin",
        state: "TX",
        projectType: "Continuity",
        priority: "high",
        openStatus: true,
        territoryOwner: "DM Texas",
        storeCall: "Call 1",
        projectNo: "P1",
        isStaffed: false,
      },
    ],
    jobsByPositionId: new Map(),
    warnings: [],
  };
}

describe("P156 candidate prioritization", () => {
  it("factor weights sum to 100", () => {
    assert.doesNotThrow(() => assertP156WeightsSumTo100());
    const sum = Object.values(P156_FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
  });

  it("produces 0-100 priority score with explainable reasons", () => {
    const cohort = buildTestCohort();
    const row = cohort.candidates[0]!;
    const factors = scoreCandidatePriorityFactors({
      row,
      context: {
        openDemand: 42,
        coverageStatus: "Critical",
        coverageNeedScore: 92,
        territoryLabel: "TX",
        dmName: "DM Texas",
        daysUntilProjectStart: 3,
        hasActiveCampaign: true,
        isContinuityProject: true,
        nearestDistanceMiles: 12,
        referenceMs: REF,
      },
      job: null,
    });
    const { priorityScore, factorBreakdown } = computeWeightedPriorityScore(factors);
    assert.ok(priorityScore >= 0 && priorityScore <= 100);
    assert.ok(factorBreakdown.length === 13);

    const reasoning = buildPriorityExplanation({ priorityScore, factorBreakdown });
    assert.ok(reasoning.length > 0);
    assert.ok(reasoning.some((r) => /open calls|project|territory|recruiter|paperwork/i.test(r)));
  });

  it("ranks critical-territory candidates highest in queue", () => {
    const cohort = buildTestCohort();
    const lowRow = buildScoredWorkflowRow(
      sample("c2", { state: "OR", city: "Portland" }),
      wf("c2", { workflowStatus: "Applied", assignedRecruiter: "Taylor Custenborder" }),
    );
    cohort.candidates.push(lowRow);

    const queue = buildPrioritizedQueueFromCohort(cohort);
    assert.equal(queue.candidates[0]?.candidateId, "c1");
    assert.ok((queue.candidates[0]?.priorityScore ?? 0) > (queue.candidates[1]?.priorityScore ?? 0));
    assert.ok(["critical", "high"].includes(resolveP156PriorityLevel(queue.candidates[0]!.priorityScore)));
  });

  it("parses API filters from query string", () => {
    const url = new URL(
      "https://example.com/api/recruiting/prioritized-queue?recruiter=Taylor%20Custenborder&priorityMin=70&state=TX",
    );
    const filters = parseP156QueueFilters(url);
    assert.equal(filters.recruiter, "Taylor Custenborder");
    assert.equal(filters.priorityMin, 70);
    assert.equal(filters.state, "TX");
  });

  it("builds executive sections without side effects", () => {
    const queue = buildPrioritizedQueueFromCohort(buildTestCohort());
    assert.equal(queue.readOnly, true);
    assert.equal(queue.sourcePhase, "P156");
    assert.ok(queue.sections.topPriority.length > 0);
    assert.ok(queue.sections.highestDemandMarkets.length > 0);
    assert.ok(queue.candidates[0]?.recommendedNextAction.length > 0);
  });
});
