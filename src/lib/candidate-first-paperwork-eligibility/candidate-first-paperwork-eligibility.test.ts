import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectCandidateFirstHardBlockers,
  evaluateCandidateFirstPaperwork,
} from "@/lib/candidate-first-paperwork-eligibility/evaluate-candidate-first-paperwork";
import {
  findNearestActiveOperationalNeed,
  resolveOriginalJobStatus,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";
import type { BreezyJob } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";

const publishedJob: BreezyJob = {
  jobId: "job-active-1",
  name: "Merchandiser — Elko",
  city: "Elko",
  state: "NV",
  status: "published",
};

function mockRow(overrides: Record<string, unknown> = {}) {
  const candidateId = "c-1";
  return {
    candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    city: "Elko",
    state: "NV",
    positionId: "closed-pos",
    positionName: "Closed Ad Title",
    stage: "applied",
    appliedDate: new Date().toISOString(),
    workflowStatus: "Applied",
    assignedRecruiter: "Taylor",
    assignedDM: "DM-1",
    hasResume: true,
    matchPercent: 82,
    paperworkStatus: "not_sent",
    actionType: "send-paperwork",
    recruitingActions: emptyRecruitingActions(),
    notes: [],
    history: [],
    questionnaireIntelligence: { techReady: true, available: true },
    resumeIntelligence: { relevantSkills: ["reset"], signalBadges: [] },
    candidateGrade: {
      overallScore: 85,
      grade: "B",
      categoryScores: {} as never,
      strengths: [],
      concerns: [],
      recommendedNextAction: "Send paperwork",
      paperworkReady: true,
      techReady: true,
      confidence: "high",
      confidenceLabel: "High",
      gradeContributors: [],
    },
    intelligence: { factors: { responseSpeed: 80 } },
    aiBreakdown: { merchandisingKeywords: 8, stageProgression: 70 },
    aiGrade: "B",
    funnelAutomation: baselineCandidateFunnelAutomation(candidateId),
    dmNeedsAssignment: false,
    ...overrides,
  } as never;
}

describe("candidate-first paperwork eligibility", () => {
  it("treats closed original ad as warning not hard blocker", () => {
    const status = resolveOriginalJobStatus("closed-pos", new Map());
    assert.equal(status, "closed_or_unpublished");

    const match = findNearestActiveOperationalNeed({
      candidateCity: "Elko",
      candidateState: "NV",
      publishedJobs: [publishedJob],
    });
    assert.ok(match);
    assert.ok((match?.matchScore ?? 0) >= 55);

    const evaluated = evaluateCandidateFirstPaperwork({
      row: mockRow(),
      candidate: {
        candidateId: "c-1",
        firstName: "Alex",
        lastName: "Rivera",
        email: "alex@example.com",
        phone: "555-0100",
        city: "Elko",
        state: "NV",
        positionId: "closed-pos",
        positionName: "Closed Ad",
        stage: "Applied",
        appliedDate: new Date().toISOString(),
      } as never,
      jobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      onboarding: null,
    });

    assert.notEqual(evaluated.recommendedAction, "Do Not Send");
    assert.equal(evaluated.originalJobStatus, "closed_or_unpublished");
    assert.ok(evaluated.warnings.some((w) => w.includes("closed or unpublished")));
  });

  it("hard blocks invalid email and duplicates", () => {
    const emailBlock = detectCandidateFirstHardBlockers({
      row: mockRow({ email: "" }),
      candidate: { email: "", stage: "Applied" } as never,
      onboarding: null,
    });
    assert.equal(emailBlock.countCategory, "Invalid Email");

    const dupBlock = detectCandidateFirstHardBlockers({
      row: mockRow({
        candidateGrade: {
          ...mockRow().candidateGrade,
          gradeContributors: [{ label: "Duplicate candidate", score: 0 }],
        },
      }),
      candidate: { email: "a@b.com", stage: "Applied", firstName: "A", lastName: "B" } as never,
      onboarding: null,
    });
    assert.equal(dupBlock.blocked, true);
    assert.equal(dupBlock.countCategory, "Duplicate");
  });
});
