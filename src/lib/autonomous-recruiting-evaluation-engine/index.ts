/**
 * @deprecated Prefer `@/lib/candidate-evaluation-orchestrator`.
 * Thin re-export + UI preview shim — no parallel scoring stack.
 */

export {
  CEO_SOURCE_PHASE as ARE_SOURCE_PHASE,
  CEO_SCHEMA_VERSION as ARE_SCHEMA_VERSION,
  getSharedScoringRubric,
  scoreCandidateRow,
  buildEmailDuplicateIndex,
  mapP204RecommendationToOutcome,
  decideFromEvaluation,
  buildPaperworkIdempotencyKey,
  planPaperworkTasks,
  schedulePaperworkRetry,
  EvaluationAuditLog,
  UnifiedAuditEmitter,
  maybeEnhanceWithLlm,
  DEFAULT_LLM_BORDERLINE_BELOW,
  orchestrate,
  applyP240FreshNewReplayReset,
  simulateP240CandidatePath,
  orchestrateEvaluationFromRows,
  orchestrateFromP204Decisions,
} from "@/lib/candidate-evaluation-orchestrator";

export type {
  CandidateEvaluation,
  DecisionOutcome,
  Decision,
  ScoringRubric,
  PaperworkTask,
  PaperworkTaskKind,
  PaperworkTaskStatus,
  AuditEvent,
  AuditEventKind,
  AuditEventLinks,
  OrchestrationTimelineEntry,
  OrchestrateOptions,
  OrchestrationBatchResult,
  OrchestrationResult,
  LlmInsight,
  P240CandidateTrace,
  LlmEnhancementProvider,
} from "@/lib/candidate-evaluation-orchestrator";

export type DecisionAction = import("@/lib/candidate-evaluation-orchestrator").DecisionOutcome;

import type {
  P204QualificationDecision,
  P204ReasonCode,
  P204Recommendation,
} from "@/lib/p204-ai-candidate-qualification/types";
import { orchestrate } from "@/lib/candidate-evaluation-orchestrator";

/**
 * Compatibility helper for the sample UI preview — builds P204-shaped
 * decisions from lightweight signals, then runs `orchestrate`.
 */
export async function orchestrateEvaluationBatch(input: {
  candidates: Array<{
    candidateId: string;
    candidateName?: string;
    workflowStatus: string;
    paperworkStatus?: string | null;
    signatureRequestId?: string | null;
    nearestJobMiles?: number | null;
    reasonCodes?: string[];
    components?: Partial<{
      resumeScore: number;
      questionnaireScore: number;
      locationScore: number;
      readinessScore: number;
      fraudSpamScore: number;
      experienceYears: number | null;
      duplicateSuspect: boolean;
    }>;
  }>;
  mode?: string;
  concurrency?: number;
  useLLMEnhancement?: boolean;
  batchId?: string;
}) {
  const evaluations: P204QualificationDecision[] = input.candidates.map((c) => {
    const codes = new Set(c.reasonCodes ?? []);
    let recommendation: P204Recommendation = "needs_recruiter_review";
    if (codes.has("explicit_disqualify") || (c.components?.fraudSpamScore ?? 0) >= 70) {
      recommendation = "reject";
    } else if (
      !codes.has("missing_questionnaire") &&
      !codes.has("manual_review_40_60") &&
      !codes.has("duplicate_suspect") &&
      (c.components?.questionnaireScore ?? 0) >= 75 &&
      (c.nearestJobMiles == null || c.nearestJobMiles <= 39)
    ) {
      recommendation = "advance_paperwork_needed";
    }

    const alreadySent =
      Boolean(String(c.signatureRequestId ?? "").trim()) ||
      ["sent", "viewed", "signed"].includes(String(c.paperworkStatus ?? "")) ||
      ["Paperwork Sent", "Signed"].includes(c.workflowStatus);
    if (alreadySent) recommendation = "needs_recruiter_review";

    return {
      candidateId: c.candidateId,
      redactedCandidateId: c.candidateId.slice(0, 12).padEnd(12, "0"),
      workflowStatus: c.workflowStatus,
      recommendation,
      confidence:
        recommendation === "advance_paperwork_needed"
          ? 85
          : recommendation === "reject"
            ? 25
            : 60,
      reasonCodes: [...(c.reasonCodes ?? [])] as P204ReasonCode[],
      evidence: [`preview signal path for ${c.candidateName ?? c.candidateId}`],
      recommendedNextAction:
        recommendation === "advance_paperwork_needed"
          ? "Queue onboarding paperwork (operator-gated)"
          : recommendation === "reject"
            ? "Present reject to recruiter"
            : "Route to recruiter review",
      components: {
        p193Decision: recommendation === "reject" ? "Not Qualified" : "Qualified",
        p193Confidence: 70,
        p1934Decision:
          recommendation === "advance_paperwork_needed" ? "Qualified" : "Needs Human Review",
        p1934Confidence: 70,
        readinessScore: c.components?.readinessScore ?? 60,
        readinessConfidence: 70,
        resumeScore: c.components?.resumeScore ?? 60,
        questionnaireScore: c.components?.questionnaireScore ?? 60,
        locationScore: c.components?.locationScore ?? 60,
        experienceYears: c.components?.experienceYears ?? null,
        nearestJobMiles: c.nearestJobMiles ?? null,
        duplicateSuspect: Boolean(c.components?.duplicateSuspect),
        fraudSpamScore: c.components?.fraudSpamScore ?? 0,
      },
    };
  });

  const result = await orchestrate({
    p204Evaluations: evaluations,
    options: {
      dryRun: true,
      useLLMEnhancement: Boolean(input.useLLMEnhancement),
      batchId: input.batchId,
    },
  });

  return {
    ...result,
    blocked: result.decisions.filter((d) => !d.automationReady).length,
    decisions: result.decisions.map((d) => ({
      ...d,
      action: d.outcome,
      evaluationId: d.evaluation.candidateId,
      thresholds: null,
      blockedBy: d.automationReady ? [] : ["human_approval_or_packet_guard"],
    })),
  };
}
