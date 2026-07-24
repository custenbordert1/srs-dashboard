import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideFromEvaluation,
  mapP204RecommendationToOutcome,
  planPaperworkTasks,
  schedulePaperworkRetry,
  orchestrateFromP204Decisions,
  orchestrate,
  getSharedScoringRubric,
  EvaluationAuditLog,
  assessCandidateDataQuality,
  validateCandidateInputQuality,
} from "@/lib/candidate-evaluation-orchestrator";
import type { P204QualificationDecision } from "@/lib/p204-ai-candidate-qualification/types";

function p204(
  overrides: Partial<P204QualificationDecision> &
    Pick<P204QualificationDecision, "recommendation" | "candidateId">,
): P204QualificationDecision {
  return {
    redactedCandidateId: "abc123abc123",
    workflowStatus: "Applied",
    confidence: 80,
    reasonCodes: ["high_qualification_confidence"],
    evidence: ["test"],
    recommendedNextAction: "next",
    components: {
      p193Decision: "Qualified",
      p193Confidence: 80,
      p1934Decision: "Qualified",
      p1934Confidence: 85,
      readinessScore: 80,
      readinessConfidence: 80,
      resumeScore: 80,
      questionnaireScore: 80,
      locationScore: 80,
      experienceYears: 2,
      nearestJobMiles: 5,
      duplicateSuspect: false,
      fraudSpamScore: 0,
    },
    ...overrides,
  };
}

describe("candidate-evaluation-orchestrator", () => {
  it("aliases P204 recommendations to decision bands without new thresholds", () => {
    assert.equal(mapP204RecommendationToOutcome("advance_paperwork_needed"), "auto_advance");
    assert.equal(mapP204RecommendationToOutcome("needs_recruiter_review"), "human_review");
    assert.equal(mapP204RecommendationToOutcome("reject"), "auto_reject");
  });

  it("exposes shared advancement rubric weights (not a fork)", () => {
    const rubric = getSharedScoringRubric();
    assert.equal(rubric.rubricId, "advancement-score-weights-v1");
    assert.equal(rubric.weights.resumeQuality, 15);
  });

  it("plans idempotent paperwork only for auto_advance", () => {
    const advance = decideFromEvaluation(
      p204({ candidateId: "a", recommendation: "advance_paperwork_needed" }),
    );
    assert.equal(advance.outcome, "auto_advance");
    assert.equal(planPaperworkTasks(advance).length, 1);

    const review = decideFromEvaluation(
      p204({ candidateId: "b", recommendation: "needs_recruiter_review" }),
    );
    assert.equal(planPaperworkTasks(review).length, 0);
  });

  it("blocks already-sent packets from automation", () => {
    const decision = decideFromEvaluation(
      p204({ candidateId: "c", recommendation: "advance_paperwork_needed" }),
      { alreadySentOrActivePacket: true },
    );
    assert.equal(decision.outcome, "human_review");
    assert.equal(decision.automationReady, false);
  });

  it("reuses P123 retry backoff for planned tasks", () => {
    const decision = decideFromEvaluation(
      p204({ candidateId: "d", recommendation: "advance_paperwork_needed" }),
    );
    const [task] = planPaperworkTasks(decision);
    const retried = schedulePaperworkRetry(task!, "Dropbox temporary 503");
    assert.equal(retried.status, "pending");
    assert.ok(retried.nextRetryAt);
  });

  it("orchestrates from provided P204 decisions in dry_run", async () => {
    const result = await orchestrateFromP204Decisions([
      p204({ candidateId: "1", recommendation: "advance_paperwork_needed", confidence: 90 }),
      p204({ candidateId: "2", recommendation: "needs_recruiter_review", confidence: 60 }),
      p204({ candidateId: "3", recommendation: "reject", confidence: 20 }),
    ]);
    assert.equal(result.mode, "dry_run");
    assert.equal(result.evaluated, 3);
    assert.equal(result.autoAdvance, 1);
    assert.equal(result.humanReview, 1);
    assert.equal(result.autoReject, 1);
    assert.equal(result.paperworkTasksPlanned, 1);
  });

  it("orchestrate returns traceId, timeline, and skips LLM by default", async () => {
    const result = await orchestrate({
      p204Evaluations: [
        p204({ candidateId: "x", recommendation: "needs_recruiter_review", confidence: 60 }),
      ],
      options: { dryRun: true, batchId: "batch-test-1" },
    });
    assert.equal(result.dryRun, true);
    assert.equal(result.useLLMEnhancement, false);
    assert.equal(result.llmEnhancementsApplied, 0);
    assert.equal(result.batchId, "batch-test-1");
    assert.ok(result.traceId.length > 8);
    assert.ok(result.timeline.length >= 3);
    assert.ok(result.audits.some((a) => a.kind === "orchestration_start"));
    assert.ok(result.audits.some((a) => a.kind === "orchestration_end"));
    assert.equal(result.evaluations[0]?.llmInsight ?? null, null);
  });

  it("optional LLM stub applies only to borderline confidence when enabled", async () => {
    const result = await orchestrate({
      p204Evaluations: [
        p204({ candidateId: "border", recommendation: "needs_recruiter_review", confidence: 60 }),
        p204({ candidateId: "strong", recommendation: "advance_paperwork_needed", confidence: 90 }),
      ],
      options: { dryRun: true, useLLMEnhancement: true, llmBorderlineBelow: 75 },
    });
    assert.equal(result.llmEnhancementsApplied, 1);
    assert.equal(result.evaluations.find((e) => e.candidateId === "border")?.llmInsight?.stub, true);
    assert.equal(result.evaluations.find((e) => e.candidateId === "strong")?.llmInsight ?? null, null);
  });

  it("assesses data quality without hard-failing missing fields", () => {
    const dq = validateCandidateInputQuality({
      candidate: {
        candidateId: "dq1",
        firstName: "",
        lastName: "",
        email: "",
        phone: "123",
        city: "",
        state: "",
        positionId: "",
        positionName: "",
      } as never,
    });
    assert.ok(dq.score < 70);
    assert.equal(dq.preferHumanReview, true);
    assert.ok(dq.issues.some((i) => i.code === "missing_email"));
    assert.ok(dq.issues.some((i) => i.code === "missing_phone"));
  });

  it("routes auto_advance to human_review when data quality prefers review", () => {
    const decision = decideFromEvaluation(
      p204({ candidateId: "dq2", recommendation: "advance_paperwork_needed", confidence: 90 }),
      {
        preferHumanReview: true,
        dataQualityScore: 45,
        dataQualityIssues: ["missing_phone:Phone missing"],
      },
    );
    assert.equal(decision.outcome, "human_review");
    assert.equal(decision.automationReady, false);
    assert.ok(decision.explanation.some((e) => /Data-quality soft gate/i.test(e)));
    assert.equal(decision.dataQualityScore, 45);
  });

  it("unified audit includes soft links to security/P71 action names", () => {
    const log = new EvaluationAuditLog({ batchId: "b1" });
    log.recordEvaluation({
      candidateId: "c1",
      redactedCandidateId: "redacted0001",
      recommendation: "needs_recruiter_review",
      confidence: 60,
      reasonCodes: ["borderline_confidence"],
      evidence: ["e1"],
    });
    log.recordPaperworkPlan({
      candidateId: "c1",
      taskCount: 1,
      idempotencyKeys: ["key"],
      p71ExecutionAuditId: "p71-demo",
    });
    const events = log.list();
    assert.equal(events[0]?.links.securityAuditAction, "recommendation_action");
    assert.equal(events[1]?.links.p71ExecutionAuditId, "p71-demo");
    assert.equal(events[1]?.links.securityAuditAction, "onboarding_send_packet");
  });
});
