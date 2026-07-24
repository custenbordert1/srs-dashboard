import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataQualityAssessment } from "@/lib/candidate-evaluation-orchestrator/data-quality";
import {
  buildP243FailureReasonExamples,
  buildP243HealthRecommendations,
  buildP243PipelineHealthReport,
  formatP243PipelineHealthMarkdown,
} from "@/lib/p243-autonomous-end-to-end-pipeline/health";
import type {
  AutonomousCandidateResult,
  AutonomousCycleReport,
} from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import { P243_SCHEMA_VERSION, P243_SOURCE_PHASE } from "@/lib/p243-autonomous-end-to-end-pipeline/types";

function stubCandidate(
  overrides: Partial<AutonomousCandidateResult> & { candidateId: string },
): AutonomousCandidateResult {
  return {
    redactedCandidateId: overrides.candidateId.slice(0, 8),
    name: "Test Candidate",
    email: null,
    positionId: "pos-1",
    appliedAt: "2026-07-01T00:00:00.000Z",
    outcome: "human_review",
    p204Recommendation: "needs_recruiter_review",
    confidence: 50,
    paperworkTasksPlanned: 0,
    paperworkExecuted: false,
    breezyStageUpdatePlanned: false,
    breezyStageUpdated: false,
    skipReason: null,
    error: null,
    ceoTraceId: "trace",
    ...overrides,
  };
}

function stubReport(
  overrides: Partial<AutonomousCycleReport> & {
    candidates: AutonomousCandidateResult[];
    autoAdvance: number;
    advanceRatePct: number;
  },
): AutonomousCycleReport {
  const scored = overrides.scored ?? overrides.candidates.length;
  return {
    sourcePhase: P243_SOURCE_PHASE,
    schemaVersion: P243_SCHEMA_VERSION,
    generatedAt: "2026-07-21T00:00:00.000Z",
    dryRun: true,
    executionMode: "dry_run",
    useLLMEnhancement: false,
    forceAutoAdvanceEnabled: false,
    forcedAutoAdvanceCount: 0,
    batchId: "batch-before",
    ceoTraceId: "ceo-before",
    pulled: overrides.candidates.length,
    scored,
    humanReview: 0,
    autoReject: 0,
    skippedIdempotent: 0,
    skippedAlreadySent: 0,
    skippedStateMachine: 0,
    skippedCanaryCap: 0,
    paperworkPlanned: 0,
    paperworkSent: 0,
    breezyStageUpdatesPlanned: 0,
    breezyStageUpdatesApplied: 0,
    failures: 0,
    averageLatencyMs: 1,
    successRatePct: 100,
    reviewQueueDepth: 0,
    commonFailureReasons: [],
    warnings: [],
    preflight: [],
    ingestion: {
      source: "durable_only",
      webhookHits: 0,
      pollHits: 0,
      deduped: 0,
      lastCheckedAt: null,
      notes: [],
    },
    failuresDetail: [],
    notes: [],
    idempotencyStorePath: ".data/p243-idempotency.json",
    freshResetApplied: 0,
    auditTraceLinks: {
      ceoTraceId: "ceo-before",
      batchId: "batch-before",
      evaluationPreviewPath: "/api/recruiting/evaluation-preview?traceId=ceo-before",
    },
    ...overrides,
  };
}

describe("p243 pipeline health report builder", () => {
  it("ranks failure reasons with examples", () => {
    const reasons = buildP243FailureReasonExamples([
      stubCandidate({
        candidateId: "c1",
        outcome: "skipped_state_machine",
        skipReason: "workflow_status:Paperwork Sent",
      }),
      stubCandidate({
        candidateId: "c2",
        outcome: "skipped_state_machine",
        skipReason: "workflow_status:Paperwork Sent",
      }),
      stubCandidate({
        candidateId: "c3",
        outcome: "human_review",
        p204Recommendation: "needs_recruiter_review",
      }),
      stubCandidate({
        candidateId: "c4",
        outcome: "auto_advance",
        p204Recommendation: "advance_paperwork_needed",
      }),
    ]);
    assert.equal(reasons[0]?.reason, "skip:workflow_status:Paperwork Sent");
    assert.equal(reasons[0]?.count, 2);
    assert.equal(reasons[0]?.examples.length, 2);
    assert.ok(!reasons.some((r) => r.reason.includes("auto_advance")));
  });

  it("compares before vs after advance rates and marks improvements", () => {
    const before = stubReport({
      batchId: "b1",
      ceoTraceId: "t1",
      autoAdvance: 1,
      advanceRatePct: 25,
      scored: 4,
      candidates: [
        stubCandidate({ candidateId: "a", outcome: "auto_advance" }),
        stubCandidate({
          candidateId: "b",
          outcome: "skipped_state_machine",
          skipReason: "stale_packet",
        }),
        stubCandidate({ candidateId: "c", outcome: "human_review" }),
        stubCandidate({ candidateId: "d", outcome: "auto_reject" }),
      ],
    });
    const after = stubReport({
      batchId: "b2",
      ceoTraceId: "t2",
      autoAdvance: 3,
      advanceRatePct: 75,
      scored: 4,
      freshResetApplied: 4,
      candidates: [
        stubCandidate({ candidateId: "a", outcome: "auto_advance" }),
        stubCandidate({ candidateId: "b", outcome: "auto_advance" }),
        stubCandidate({ candidateId: "c", outcome: "auto_advance" }),
        stubCandidate({ candidateId: "d", outcome: "human_review" }),
      ],
    });

    const dq: DataQualityAssessment[] = [
      {
        candidateId: "b",
        score: 55,
        grade: "D",
        preferHumanReview: true,
        summary: "missing phone",
        issues: [
          {
            code: "missing_phone",
            field: "phone",
            reason: "Phone missing",
            severity: "blocking",
          },
        ],
      },
    ];

    const report = buildP243PipelineHealthReport({
      before,
      after,
      dataQualityAssessments: dq,
      limit: 4,
      generatedAt: "2026-07-21T12:00:00.000Z",
    });

    assert.equal(report.mode, "dry_run_only");
    assert.equal(report.autoAdvance.before.ratePct, 25);
    assert.equal(report.autoAdvance.after.ratePct, 75);
    assert.equal(report.autoAdvance.deltaPctPoints, 50);
    // b skipped→advance, c review→advance, d reject→review
    assert.equal(report.improvedCount, 3);
    assert.equal(report.regressedCount, 0);
    assert.equal(report.freshResetApplied, 4);
    assert.equal(report.dataQuality.topIssues[0]?.code, "missing_phone");
    assert.ok(report.recommendations.some((r) => /Fresh reset/i.test(r)));
    assert.ok(report.recommendations.some((r) => /dry-run only/i.test(r)));

    const md = formatP243PipelineHealthMarkdown(report);
    assert.match(md, /P243 Pipeline Health/);
    assert.match(md, /forceFreshReset/);
    assert.match(md, /missing_phone/);
  });

  it("recommends investigating real gates when reset does not help", () => {
    const recs = buildP243HealthRecommendations({
      afterAdvanceRatePct: 10,
      deltaPctPoints: 0,
      improvedCount: 0,
      regressedCount: 0,
      compared: 10,
      topFailureReasons: [
        {
          reason: "rec:needs_recruiter_review",
          count: 8,
          examples: [],
        },
      ],
      dataQuality: {
        assessed: 10,
        averageScore: 80,
        preferHumanReviewCount: 2,
        topIssues: [],
      },
      freshResetApplied: 10,
    });
    assert.ok(recs.some((r) => /did not move advance rate/i.test(r)));
    assert.ok(recs.some((r) => /needs_recruiter_review/i.test(r)));
    assert.ok(recs.some((r) => /do not enable live/i.test(r)));
  });
});
