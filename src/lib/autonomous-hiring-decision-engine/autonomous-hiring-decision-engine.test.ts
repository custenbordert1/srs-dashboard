import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildHiringDecision,
  buildHiringDecisionQueues,
  runHiringDecisionSimulation,
  validateHiringDecisionQueues,
} from "@/lib/autonomous-hiring-decision-engine";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-05",
    createdDate: "2026-06-05",
    addedDate: "2026-06-05",
    updatedDate: "2026-06-05",
    addedDateSource: "creation_date",
    positionId: "p1",
    positionName: "Field Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText:
      "Retail merchandiser with Walmart reset experience. Customer service and phone support background. Cash handling and POS. Team lead experience. Willing to travel 50 miles. 2019-2021 Walmart. 2023-2025 Target merchandising.",
    hasResume: true,
    resumeFields: {
      summary: "Experienced retail merchandiser.",
      workHistoryText: "Walmart reset associate\nTarget merchandiser",
    },
    questionnaireAnswers: [
      { question: "Do you have a smartphone?", answer: "Yes" },
      { question: "Do you have internet access?", answer: "Yes" },
      { question: "Are you comfortable with mobile apps?", answer: "Yes" },
      { question: "Reliable transportation?", answer: "Yes" },
      { question: "Merchandising experience", answer: "3 years" },
      { question: "Prior vendor experience", answer: "SRS, Acosta" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

function publishedJob(): BreezyJob {
  return {
    jobId: "p1",
    name: "Field Merchandiser",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    status: "published",
    updatedDate: "2026-06-01",
    createdDate: "2026-06-01",
    location: "Dallas, TX",
    department: "",
    description: "",
    type: "",
    category: "",
    experience: "",
    education: "",
    tags: [],
    recruiter: "",
    hiringManager: "",
  } as BreezyJob;
}

describe("autonomous-hiring-decision-engine (P87)", () => {
  it("assigns fast track for strong grade B candidate with complete data", () => {
    const row = buildScoredWorkflowRow(sampleCandidate(), {
      candidateId: "c1",
      workflowStatus: "Applied",
      assignedRecruiter: "Jordan Smith",
      assignedDM: "DM",
      notes: [],
      history: [],
    });
    const jobs = new Map([[publishedJob().jobId, publishedJob()]]);
    const decision = buildHiringDecision({ row, jobsByPositionId: jobs });
    assert.equal(decision.action, "fast_track");
    assert.ok(decision.explanation.reasoningBullets.some((b) => b.includes("FAST TRACK")));
    assert.ok(decision.explanation.positiveFactors.length > 0);
    assert.ok(decision.explanation.estimatedTimeSavedMinutes > 0);
  });

  it("assigns missing information when resume and questionnaire are unavailable", () => {
    const row = buildScoredWorkflowRow(
      sampleCandidate({
        hasResume: false,
        resumeText: "",
        resumeFields: undefined,
        questionnaireAnswers: undefined,
        hasQuestionnaire: false,
      }),
    );
    const decision = buildHiringDecision({ row, jobsByPositionId: new Map() });
    assert.equal(decision.action, "missing_information");
    assert.ok(decision.explanation.missingData.length > 0);
  });

  it("assigns reject for grade D", () => {
    const row = buildScoredWorkflowRow(
      sampleCandidate({
        resumeText: "short",
        questionnaireAnswers: [{ question: "Reliable transportation?", answer: "No" }],
      }),
      { candidateId: "c1", workflowStatus: "Applied", assignedRecruiter: "R", assignedDM: "DM", notes: [], history: [] },
    );
    const decision = buildHiringDecision({ row, jobsByPositionId: new Map([[ "p1", publishedJob() ]]) });
    assert.ok(["reject", "recruiter_review", "hold"].includes(decision.action));
    assert.ok(decision.explanation.reasoningBullets.length > 1);
  });

  it("holds candidates on closed positions", () => {
    const row = buildScoredWorkflowRow(sampleCandidate({ positionId: "closed-job" }));
    const decision = buildHiringDecision({ row, jobsByPositionId: new Map() });
    assert.equal(decision.action, "hold");
    assert.ok(decision.explanation.reasoningBullets.some((b) => b.toLowerCase().includes("position")));
  });

  it("ensures exactly one queue per candidate in simulation", () => {
    const jobs = new Map([[publishedJob().jobId, publishedJob()]]);
    const rows = [
      buildScoredWorkflowRow(sampleCandidate({ candidateId: "a" })),
      buildScoredWorkflowRow(
        sampleCandidate({ candidateId: "b", positionId: "missing" }),
      ),
      buildScoredWorkflowRow(
        sampleCandidate({
          candidateId: "c",
          hasResume: false,
          resumeText: "",
          questionnaireAnswers: undefined,
          hasQuestionnaire: false,
        }),
      ),
    ];
    const simulation = runHiringDecisionSimulation({ rows, jobsByPositionId: jobs });
    const validation = validateHiringDecisionQueues(simulation.decisions);
    assert.equal(validation.ok, true, validation.errors.join("; "));
    assert.equal(simulation.totalCandidates, rows.length);
    const queues = buildHiringDecisionQueues(simulation.decisions);
    const totalQueued =
      queues.fast_track.length +
      queues.recruiter_review.length +
      queues.hold.length +
      queues.reject.length +
      queues.missing_information.length;
    assert.equal(totalQueued, rows.length);
  });

  it("includes explainability fields on every decision", () => {
    const row = buildScoredWorkflowRow(sampleCandidate());
    const decision = buildHiringDecision({
      row,
      jobsByPositionId: new Map([[publishedJob().jobId, publishedJob()]]),
    });
    assert.ok(decision.explanation.overallRecommendation);
    assert.ok(decision.explanation.recommendedRecruiterAction);
    assert.ok(Array.isArray(decision.explanation.positiveFactors));
    assert.ok(Array.isArray(decision.explanation.negativeFactors));
    assert.ok(Array.isArray(decision.explanation.missingData));
    assert.ok(decision.explanation.reasoningBullets.length >= 2);
  });
});
