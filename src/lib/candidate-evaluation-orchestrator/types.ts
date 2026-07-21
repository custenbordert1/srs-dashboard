/**
 * Thin candidate evaluation orchestrator — composes existing engines.
 * Does not introduce a parallel scoring stack. Prefer P204 + P123 + P240.
 */

import type { P204QualificationDecision, P204Recommendation } from "@/lib/p204-ai-candidate-qualification/types";
import { ADVANCEMENT_SCORE_WEIGHTS } from "@/lib/recruiting/candidate-advancement-engine";

export const CEO_SOURCE_PHASE = "CEO" as const;
export const CEO_SCHEMA_VERSION = 1 as const;

/** Optional LLM enrichment — empty unless useLLMEnhancement is enabled. */
export type LlmInsight = {
  provider: string;
  model: string | null;
  summary: string;
  confidenceDelta: number;
  suggestedOutcome: "auto_advance" | "human_review" | "auto_reject" | null;
  latencyMs: number;
  /** True when the provider was a no-op stub / disabled. */
  stub: boolean;
};

/** Product alias — evaluation IS the P204 decision (+ optional llmInsight). */
export type CandidateEvaluation = P204QualificationDecision & {
  llmInsight?: LlmInsight | null;
};

/** Shared public decision band (maps 1:1 from P204). */
export type DecisionOutcome = "auto_advance" | "human_review" | "auto_reject";

export type Decision = {
  decisionId: string;
  candidateId: string;
  evaluation: CandidateEvaluation;
  outcome: DecisionOutcome;
  p204Recommendation: P204Recommendation;
  confidence: number;
  humanApprovalRequired: boolean;
  automationReady: boolean;
  explanation: string[];
  nextAction: string;
  generatedAt: string;
  /** Optional data-quality score (0–100) from CEO input validation. */
  dataQualityScore?: number | null;
  dataQualityIssues?: string[];
};

/** Documented rubric view over existing advancement weights (not a second scorer). */
export type ScoringRubric = {
  rubricId: "advancement-score-weights-v1";
  weights: typeof ADVANCEMENT_SCORE_WEIGHTS;
  thresholdSource: "p204-blend + p193.4 qualified-90-nhro-70";
};

export type PaperworkTaskKind = "onboarding_packet" | "nda" | "background_check";

export type PaperworkTaskStatus =
  | "ready"
  | "pending"
  | "blocked"
  | "failed"
  | "cancelled";

/** Gap-fill task entity for planning; execution stays in P123/P184. */
export type PaperworkTask = {
  taskId: string;
  candidateId: string;
  kind: PaperworkTaskKind;
  status: PaperworkTaskStatus;
  idempotencyKey: string;
  templateKey: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  decisionId: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEventKind =
  | "orchestration_start"
  | "orchestration_end"
  | "evaluation"
  | "decision"
  | "paperwork_plan"
  | "llm_enhancement"
  | "data_quality"
  | "simulate"
  | "error"
  | "link";

export type AuditEventLinks = {
  /** Soft link to P71 paperwork execution audit id when known. */
  p71ExecutionAuditId?: string | null;
  /** Soft link to security audit action key when known. */
  securityAuditAction?: string | null;
  /** Cross-reference for operator timeline / P123 cycle. */
  paperworkCycleId?: string | null;
  p240TraceId?: string | null;
};

export type AuditEvent = {
  eventId: string;
  traceId: string;
  batchId: string | null;
  seq: number;
  kind: AuditEventKind;
  candidateId: string | null;
  timestamp: string;
  message: string;
  details: Record<string, unknown>;
  links: AuditEventLinks;
};

export type OrchestrationTimelineEntry = {
  at: string;
  kind: AuditEventKind;
  message: string;
  candidateId: string | null;
  seq: number;
};

export type OrchestrateOptions = {
  /** Default true — never writes durable state from this composer. */
  dryRun?: boolean;
  /** Default false — LLM layer is opt-in and stubbed unless a provider is injected. */
  useLLMEnhancement?: boolean;
  batchId?: string;
  /** Confidence below this (0–100 P204 scale) may invoke LLM enhancement when enabled. */
  llmBorderlineBelow?: number;
};

/** Legacy shape kept for backward compatibility. */
export type OrchestrationBatchResult = {
  mode: "dry_run";
  evaluated: number;
  autoAdvance: number;
  humanReview: number;
  autoReject: number;
  paperworkTasksPlanned: number;
  averageLatencyMs: number;
  evaluations: CandidateEvaluation[];
  decisions: Decision[];
  paperworkTasks: PaperworkTask[];
  audits: AuditEvent[];
};

/** Rich orchestration result with full trace + timeline. */
export type OrchestrationResult = OrchestrationBatchResult & {
  traceId: string;
  batchId: string;
  dryRun: boolean;
  useLLMEnhancement: boolean;
  llmEnhancementsApplied: number;
  timeline: OrchestrationTimelineEntry[];
  options: Required<Pick<OrchestrateOptions, "dryRun" | "useLLMEnhancement">> & {
    batchId: string;
    llmBorderlineBelow: number;
  };
};
