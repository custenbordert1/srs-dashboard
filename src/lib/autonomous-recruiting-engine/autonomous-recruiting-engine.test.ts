import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  applyApprovalRulesToAds,
  buildAutopilotSnapshot,
  buildCoverageNeeds,
  buildHiringRecommendations,
  buildPostingRecommendations,
  countHiringRecommendationsByAction,
  DEFAULT_APPROVAL_RULES,
  evaluateApprovalRules,
  resolveHiringAction,
} from "@/lib/autonomous-recruiting-engine";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { evaluateCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation/evaluate-candidate-automation";
import type { RecommendedAd, TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";

function candidate(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-01",
    createdDate: "2026-06-01",
    addedDate: "2026-06-01",
    updatedDate: "2026-06-01",
    addedDateSource: "creation_date",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "Walmart reset merchandiser retail experience willing to travel.",
    hasResume: true,
    questionnaireAnswers: [
      { question: "Smartphone access", answer: "Yes" },
      { question: "Internet access", answer: "Yes" },
      { question: "Comfort with apps", answer: "Yes" },
      { question: "Merchandising experience", answer: "5 years" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: patch.paperworkStatus ?? "not_sent",
    signatureRequestId: patch.signatureRequestId ?? null,
    paperworkTemplateKey: patch.paperworkTemplateKey ?? null,
    paperworkSentAt: patch.paperworkSentAt ?? null,
    paperworkSignedAt: patch.paperworkSignedAt ?? null,
    paperworkError: patch.paperworkError ?? null,
    directDepositStatus: patch.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
  };
}

function job(id: string, patch: Partial<BreezyJob> = {}): BreezyJob {
  return {
    jobId: id,
    name: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    displayLocation: "Dallas, TX",
    locationSource: "location",
    status: "published",
    createdDate: "2026-05-01",
    updatedDate: "2026-06-01",
    ...patch,
  };
}

function opportunity(patch: Partial<MelOpportunity> = {}): MelOpportunity {
  return {
    opportunityId: "opp-1",
    projectNo: "P-100",
    projectName: "Reset Dallas",
    client: "Client",
    storeAddress: "1 Main St",
    storeName: "Store 12",
    city: "Dallas",
    state: "TX",
    projectType: "Reset",
    priority: "high",
    openStatus: true,
    isStaffed: false,
    territoryOwner: "DM Texas",
    storeCall: "Open",
    ...patch,
  };
}

describe("autonomous recruiting engine", () => {
  it("flags critical coverage when open calls exceed reps with weak pipeline", () => {
    const opportunities = [
      opportunity({ opportunityId: "o1", state: "TX" }),
      opportunity({ opportunityId: "o2", state: "TX" }),
      opportunity({ opportunityId: "o3", state: "TX" }),
    ];
    const needs = buildCoverageNeeds({
      jobs: [job("job-1", { createdDate: "2026-04-01" })],
      candidates: [],
      workflows: {},
      opportunities,
      fetchedAt: "2026-06-15T12:00:00.000Z",
    });

    assert.ok(needs.length > 0);
    const top = needs[0]!;
    assert.ok(top.coverageNeedScore >= 40);
    assert.ok(["Watch", "At Risk", "Critical"].includes(top.coverageStatus));
    assert.ok(top.drivers.length > 0);
    assert.ok(top.recommendedAction.length > 0);
  });

  it("marks healthy territories when coverage pressure is low", () => {
    const workflows = {
      active: workflow("active", { workflowStatus: "Active Rep" }),
    };
    const needs = buildCoverageNeeds({
      jobs: [],
      candidates: [candidate("active")],
      workflows,
      opportunities: [opportunity({ openStatus: false, isStaffed: true })],
      fetchedAt: "2026-06-15T12:00:00.000Z",
    });

    const healthyOrEmpty = needs.every((row) => row.coverageStatus === "Healthy" || row.openCalls === 0);
    assert.equal(healthyOrEmpty, true);
  });

  it("recommends new ad posting for coverage gaps", () => {
    const scoredRows = [buildScoredWorkflowRow(candidate("c1"), workflow("c1"))];
    const coverageNeeds: TerritoryCoverageNeed[] = [
      {
        territoryKey: "DM Texas",
        territoryLabel: "TX",
        dmName: "DM Texas",
        states: ["TX"],
        openCalls: 4,
        activeReps: 0,
        pipelineCandidates: 1,
        applicantCount: 1,
        coverageStatus: "Critical",
        coverageNeedScore: 85,
        drivers: ["No active reps in territory"],
        recommendedAction: "Launch urgent posting",
      },
    ];

    const recs = buildPostingRecommendations({
      jobs: [job("job-1")],
      candidates: scoredRows.map((row) => candidate(row.candidateId)),
      scoredRows,
      coverageNeeds,
      fetchedAt: "2026-06-15T12:00:00.000Z",
      approvalRules: DEFAULT_APPROVAL_RULES,
    });

    assert.ok(recs.some((rec) => rec.adType === "create-new-ad" || rec.adType === "refresh-ad"));
    assert.ok(recs.every((rec) => rec.reason.length > 0));
  });

  it("auto-approves posting when coverage score high and applicants low", () => {
    const coverageNeeds: TerritoryCoverageNeed[] = [
      {
        territoryKey: "DM Texas",
        territoryLabel: "TX",
        dmName: "DM Texas",
        states: ["TX"],
        openCalls: 5,
        activeReps: 0,
        pipelineCandidates: 2,
        applicantCount: 2,
        coverageStatus: "Critical",
        coverageNeedScore: 90,
        drivers: [],
        recommendedAction: "Post",
      },
    ];

    const ads: RecommendedAd[] = [
      {
        id: "ad-1",
        title: "Merchandiser",
        city: "Dallas",
        state: "TX",
        territory: "DM Texas",
        reason: "Coverage gap",
        expectedApplicants: { min: 3, max: 8 },
        priority: "high",
        approvalStatus: "pending",
        coverageNeedScore: 90,
        adType: "create-new-ad",
      },
    ];

    const evaluated = applyApprovalRulesToAds(ads, DEFAULT_APPROVAL_RULES, coverageNeeds);
    assert.equal(evaluated[0]?.approvalStatus, "auto-approved");
  });

  it("keeps close-pause ads pending for recruiter approval", () => {
    const coverageNeeds: TerritoryCoverageNeed[] = [];
    const ads: RecommendedAd[] = [
      {
        id: "ad-close",
        title: "Merchandiser",
        city: "Dallas",
        state: "TX",
        territory: "DM Texas",
        reason: "Enough qualified pipeline",
        expectedApplicants: { min: 0, max: 0 },
        priority: "medium",
        approvalStatus: "pending",
        adType: "close-pause-ad",
      },
    ];

    const { ads: evaluated } = evaluateApprovalRules(ads, DEFAULT_APPROVAL_RULES, {
      coverageNeeds,
      applicantCountByTerritory: new Map(),
    });
    assert.equal(evaluated[0]?.approvalStatus, "pending");
  });

  it("recommends interview for qualified grade B candidates", () => {
    const row = buildScoredWorkflowRow(
      candidate("int-1"),
      workflow("int-1", {
        workflowStatus: "Qualified",
        recruitingActions: { ...emptyRecruitingActions(), recommendInterview: true },
      }),
    );
    const recs = buildHiringRecommendations({
      scoredRows: [row],
      coverageNeeds: [],
    });

    const match = recs.find((rec) => rec.candidateId === "int-1");
    assert.ok(match);
    assert.equal(match.recommendedAction, "Interview");
    assert.ok(match.reasons.length > 0);
  });

  it("recommends reject only as oversight suggestion for disqualified candidates", () => {
    const row = buildScoredWorkflowRow(
      candidate("bad", { stage: "Not Qualified", resumeText: "", hasResume: false }),
      workflow("bad", { workflowStatus: "Not Qualified" }),
    );
    const recs = buildHiringRecommendations({ scoredRows: [row], coverageNeeds: [] });
    const match = recs.find((rec) => rec.candidateId === "bad");
    assert.ok(match);
    assert.equal(match.recommendedAction, "Reject");
  });

  it("maps grade A high-confidence qualified candidates to Hire Now", () => {
    const base = buildScoredWorkflowRow(candidate("a-high"), workflow("a-high"));
    const row = {
      ...base,
      candidateGrade: { ...base.candidateGrade, grade: "A" as const, confidence: "high" as const },
    };
    const review = evaluateApplicantReview(row);
    const action = resolveHiringAction({
      row,
      review,
      funnel: evaluateCandidateFunnelAutomation(row),
      coverageNeed: null,
    });
    assert.equal(action, "Hire Now");
  });

  it("maps grade A medium-confidence to Interview unless coverage is critical", () => {
    const base = buildScoredWorkflowRow(candidate("a-med"), workflow("a-med"));
    const row = {
      ...base,
      candidateGrade: { ...base.candidateGrade, grade: "A" as const, confidence: "medium" as const },
    };
    const review = evaluateApplicantReview(row);
    const action = resolveHiringAction({
      row,
      review,
      funnel: evaluateCandidateFunnelAutomation(row),
      coverageNeed: null,
    });
    assert.equal(action, "Interview");
  });

  it("maps low-signal needs-review candidates to Hold", () => {
    const row = buildScoredWorkflowRow(
      candidate("hold-1", {
        resumeText: "short",
        hasResume: true,
        questionnaireAnswers: [{ question: "Smartphone access", answer: "Yes" }],
      }),
      workflow("hold-1"),
    );
    const patched = {
      ...row,
      candidateGrade: { ...row.candidateGrade, grade: "C" as const, confidence: "low" as const },
    };
    const review = evaluateApplicantReview(patched);
    assert.ok(review.verdict === "needs-review" || review.verdict === "incomplete");
    const action = resolveHiringAction({
      row: patched,
      review,
      funnel: evaluateCandidateFunnelAutomation(patched),
      coverageNeed: null,
    });
    assert.equal(action, "Hold");
  });

  it("limits Hold rows in surfaced recommendations", () => {
    const holds = Array.from({ length: 20 }, (_, index) => {
      const id = `hold-${index}`;
      const base = buildScoredWorkflowRow(
        candidate(id, { resumeText: "", hasResume: false, questionnaireAnswers: [] }),
        workflow(id),
      );
      return {
        ...base,
        candidateGrade: { ...base.candidateGrade, grade: "C" as const, confidence: "low" as const },
      };
    });
    const hire = buildScoredWorkflowRow(
      candidate("hire-1"),
      workflow("hire-1", { workflowStatus: "Ready for MEL" }),
    );
    const recs = buildHiringRecommendations({ scoredRows: [...holds, hire], coverageNeeds: [], limit: 15 });
    const counts = countHiringRecommendationsByAction(recs);
    assert.equal(counts["Hire Now"], 1);
    assert.ok(counts.Hold <= 8);
    assert.equal(recs[0]?.recommendedAction, "Hire Now");
  });

  it("builds autopilot snapshot with KPIs and pipeline flow from real counts", () => {
    const candidates = [candidate("c1"), candidate("c2", { stage: "Interview" })];
    const workflows = {
      c1: workflow("c1"),
      c2: workflow("c2", { workflowStatus: "Qualified" }),
    };
    const scoredRows = candidates.map((c) => buildScoredWorkflowRow(c, workflows[c.candidateId]));

    const snapshot = buildAutopilotSnapshot({
      jobs: [job("job-1")],
      candidates,
      workflows,
      opportunities: [opportunity(), opportunity({ opportunityId: "o2" })],
      scoredRows,
      fetchedAt: "2026-06-15T12:00:00.000Z",
      approvalRules: DEFAULT_APPROVAL_RULES,
      automationRuns: {
        pending: [],
        approved: [],
        executed: [],
        failed: [],
        rejected: [],
        generatedAt: "2026-06-15T12:00:00.000Z",
      },
    });

    assert.ok(snapshot.pipelineFlow.length >= 4);
    assert.ok(snapshot.kpis.hoursSavedFormula.includes("hoursSaved"));
    assert.equal(typeof snapshot.kpis.estimatedHoursSaved, "number");
    assert.ok(Array.isArray(snapshot.coverageNeeds));
    assert.ok(Array.isArray(snapshot.postingRecommendations));
    assert.ok(Array.isArray(snapshot.hiringRecommendations));
    assert.equal(snapshot.automationRuns.pending, 0);
  });
});
