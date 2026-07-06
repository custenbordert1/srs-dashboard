import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import {
  ADVANCEMENT_SCORE_WEIGHTS,
  evaluateCandidate,
} from "@/lib/recruiting/candidate-advancement-engine";
import { buildCandidateAdvancementIntelligenceSnapshot } from "@/lib/p144-candidate-advancement-intelligence/build-advancement-intelligence-snapshot";

function baselineGrade(): ScoredCandidateWorkflowRow["candidateGrade"] {
  return {
    overallScore: 80,
    grade: "B",
    categoryScores: {
      retailMerchandisingExperience: 80,
      reliabilityReadiness: 80,
      technologyReadiness: 80,
      communicationReadiness: 80,
      projectFit: 80,
      paperworkReadiness: 80,
      riskFlags: 80,
    },
    strengths: ["Strong retail background"],
    concerns: [],
    recommendedNextAction: "Screen candidate",
    paperworkReady: true,
    techReady: true,
    confidence: "high",
    confidenceLabel: "High confidence",
    gradeContributors: [],
  };
}

function mockRow(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  const candidateId = overrides.candidateId ?? "c-1";
  return {
    candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    positionId: "pos-1",
    positionName: "Merchandiser",
    stage: "applied",
    appliedDate: new Date().toISOString(),
    workflowStatus: "Applied",
    assignedRecruiter: "Taylor",
    assignedDM: "DM-1",
    hasResume: true,
    matchPercent: 82,
    isTopMatch: true,
    distanceMiles: 12,
    aiGrade: "B",
    nextActionNeeded: "Screen candidate",
    paperworkStatus: "not_sent",
    recruitingActions: { calls: 0, emails: 0, texts: 0, notes: 0 },
    notes: [],
    questionnaireIntelligence: { techReady: true, available: true },
    resumeIntelligence: { relevantSkills: ["reset", "walmart"], signalBadges: [] },
    candidateGrade: baselineGrade(),
    intelligence: { factors: { responseSpeed: 80 } },
    aiBreakdown: { merchandisingKeywords: 8, stageProgression: 70 },
    funnelAutomation: baselineCandidateFunnelAutomation(candidateId),
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

describe("recruiting/candidate-advancement-engine", () => {
  it("documents score weights that sum to 100", () => {
    const total = Object.values(ADVANCEMENT_SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    assert.equal(total, 100);
  });

  it("returns advancement score, hire probability, and next action", () => {
    const job: BreezyJob = {
      jobId: "pos-1",
      name: "Massena Merchandiser",
      city: "Massena",
      state: "NY",
      status: "published",
      createdDate: "2026-01-01",
      updatedDate: "2026-01-01",
    };
    const jobsByPositionId = new Map([[job.jobId, job]]);

    const evaluation = evaluateCandidate({
      row: mockRow(),
      jobsByPositionId,
      advancementOptions: { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE },
    });

    assert.equal(evaluation.candidateId, "c-1");
    assert.ok(evaluation.advancementScore >= 0 && evaluation.advancementScore <= 100);
    assert.ok([10, 25, 50, 75, 90].includes(evaluation.estimatedHireProbability));
    assert.ok(evaluation.confidence >= 0 && evaluation.confidence <= 100);
    assert.ok(evaluation.nextAction.length > 0);
    assert.ok(evaluation.reason.length > 0);
    assert.ok(evaluation.recommendedRecruiterAction.length > 0);
  });

  it("flags blockers and disables automation when manual review required", () => {
    const jobsByPositionId = new Map<string, BreezyJob>();
    const evaluation = evaluateCandidate({
      row: mockRow({
        hasResume: false,
        workflowStatus: "Needs Review",
        actionType: "needs-review",
        questionnaireIntelligence: { techReady: false },
      }),
      jobsByPositionId,
      advancementOptions: { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE },
    });

    assert.ok(evaluation.blockers.includes("Missing Resume"));
    assert.ok(evaluation.blockers.includes("Manual Review Required"));
    assert.equal(evaluation.automationEligible, false);
  });
});

describe("p144-candidate-advancement-intelligence snapshot", () => {
  it("builds executive metrics and automation preview queue", () => {
    const jobsByPositionId = new Map([
      [
        "pos-1",
        {
          jobId: "pos-1",
          name: "Project A",
          city: "NY",
          state: "NY",
          status: "published",
          createdDate: "2026-01-01",
          updatedDate: "2026-01-01",
        } as BreezyJob,
      ],
    ]);
    const evaluations = [
      evaluateCandidate({
        row: mockRow({ candidateId: "c-1" }),
        jobsByPositionId,
        advancementOptions: { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE },
      }),
      evaluateCandidate({
        row: mockRow({ candidateId: "c-2", assignedRecruiter: "Sam" }),
        jobsByPositionId,
        advancementOptions: { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE },
      }),
    ];

    const snapshot = buildCandidateAdvancementIntelligenceSnapshot({
      evaluations,
      generatedAt: new Date().toISOString(),
      partialSync: false,
    });

    assert.equal(snapshot.sourcePhase, "P144");
    assert.equal(snapshot.mode, "readOnly");
    assert.equal(snapshot.executeBatchCalled, false);
    assert.equal(snapshot.breezyWrites, false);
    assert.equal(snapshot.paperworkSent, false);
    assert.equal(snapshot.candidatesEvaluated, 2);
    assert.ok(snapshot.executive.averageAdvancementScore >= 0);
    assert.ok(snapshot.validation.topAutomationCandidates.length <= 25);
    assert.ok(snapshot.validation.topManualReviewCandidates.length <= 25);
    for (const row of snapshot.automationPreviewQueue) {
      assert.equal(row.previewOnly, true);
      assert.equal(row.approveDisabled, true);
      assert.equal(row.rejectDisabled, true);
    }
  });
});
