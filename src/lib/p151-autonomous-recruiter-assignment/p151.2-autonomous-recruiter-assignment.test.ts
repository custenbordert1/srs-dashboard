import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { baselineCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation";
import { evaluateRecruiterAssignmentCandidate } from "@/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate";

const publishedJob: BreezyJob = {
  jobId: "job-1",
  name: "Merchandiser Elko",
  city: "Elko",
  state: "NV",
  status: "published",
};

function mockCandidate() {
  return {
    candidateId: "c-1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    city: "Elko",
    state: "NV",
    zipCode: "89801",
    positionId: "closed-pos",
    positionName: "Closed Ad",
    stage: "Applied",
    appliedDate: new Date().toISOString(),
  } as never;
}

function mockRow() {
  const candidateId = "c-1";
  return {
    candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    city: "Elko",
    state: "NV",
    positionId: "closed-pos",
    positionName: "Closed Ad",
    stage: "applied",
    appliedDate: new Date().toISOString(),
    workflowStatus: "Applied",
    assignedRecruiter: "Unassigned",
    assignedDM: "DM-1",
    hasResume: true,
    matchPercent: 82,
    distanceMiles: 12,
    paperworkStatus: "not_sent",
    actionType: "none",
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
  } as never;
}

describe("P151.2 autonomous recruiter assignment", () => {
  it("recommends Assign Recruiter when territory match passes threshold", () => {
    const result = evaluateRecruiterAssignmentCandidate({
      row: mockRow(),
      candidate: mockCandidate(),
      assignment: {
        candidateId: "c-1",
        recruiter: "Taylor",
        confidence: 72,
        reason: "Territory match in NV — Taylor selected by workload balance.",
        territoryState: "NV",
        dmName: "DM-1",
        shouldAssign: true,
      },
      jobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      onboarding: null,
    });
    assert.equal(result.recommendation, "Assign Recruiter");
    assert.equal(result.autoAssignEligible, true);
    assert.equal(result.recommendedRecruiter, "Taylor");
  });

  it("holds when recruiter already assigned", () => {
    const result = evaluateRecruiterAssignmentCandidate({
      row: mockRow({ assignedRecruiter: "Jordan" }),
      candidate: mockCandidate(),
      assignment: {
        candidateId: "c-1",
        recruiter: "Jordan",
        confidence: 100,
        reason: "Recruiter already assigned.",
        territoryState: "NV",
        dmName: null,
        shouldAssign: false,
      },
      jobsByPositionId: new Map(),
      publishedJobs: [publishedJob],
      onboarding: null,
    });
    assert.equal(result.recommendation, "Hold");
    assert.equal(result.autoAssignEligible, false);
  });
});
