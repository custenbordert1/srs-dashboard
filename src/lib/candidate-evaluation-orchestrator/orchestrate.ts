import { randomUUID } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { EvaluationAuditLog } from "@/lib/candidate-evaluation-orchestrator/audit";
import { validateCandidateInputQuality } from "@/lib/candidate-evaluation-orchestrator/data-quality";
import { decideFromEvaluation } from "@/lib/candidate-evaluation-orchestrator/decide";
import {
  DEFAULT_LLM_BORDERLINE_BELOW,
  maybeEnhanceWithLlm,
  type LlmEnhancementProvider,
} from "@/lib/candidate-evaluation-orchestrator/enhance";
import { planPaperworkTasks } from "@/lib/candidate-evaluation-orchestrator/paperwork";
import {
  buildEmailDuplicateIndex,
  scoreCandidateRow,
} from "@/lib/candidate-evaluation-orchestrator/score";
import type {
  CandidateEvaluation,
  Decision,
  OrchestrateOptions,
  OrchestrationResult,
  PaperworkTask,
} from "@/lib/candidate-evaluation-orchestrator/types";
import type { P204QualificationDecision } from "@/lib/p204-ai-candidate-qualification/types";

function alreadySent(row: ScoredCandidateWorkflowRow): boolean {
  const stage = String(row.workflowStatus ?? "");
  const paperwork = String(row.paperworkStatus ?? "not_sent");
  if (["Paperwork Sent", "Signed"].includes(stage)) return true;
  if (["sent", "viewed", "signed"].includes(paperwork)) return true;
  if (String(row.signatureRequestId ?? "").trim()) return true;
  return false;
}

function resolveOptions(options?: OrchestrateOptions): {
  dryRun: boolean;
  useLLMEnhancement: boolean;
  batchId: string;
  llmBorderlineBelow: number;
} {
  return {
    dryRun: options?.dryRun !== false,
    useLLMEnhancement: Boolean(options?.useLLMEnhancement),
    batchId: options?.batchId ?? randomUUID(),
    llmBorderlineBelow: options?.llmBorderlineBelow ?? DEFAULT_LLM_BORDERLINE_BELOW,
  };
}

function summarize(
  evaluations: CandidateEvaluation[],
  decisions: Decision[],
  paperworkTasks: PaperworkTask[],
  audit: EvaluationAuditLog,
  started: number,
  opts: ReturnType<typeof resolveOptions>,
  llmEnhancementsApplied: number,
): OrchestrationResult {
  return {
    mode: "dry_run",
    dryRun: opts.dryRun,
    useLLMEnhancement: opts.useLLMEnhancement,
    traceId: audit.traceId,
    batchId: opts.batchId,
    evaluated: evaluations.length,
    autoAdvance: decisions.filter((d) => d.outcome === "auto_advance").length,
    humanReview: decisions.filter((d) => d.outcome === "human_review").length,
    autoReject: decisions.filter((d) => d.outcome === "auto_reject").length,
    paperworkTasksPlanned: paperworkTasks.length,
    llmEnhancementsApplied,
    averageLatencyMs:
      evaluations.length > 0
        ? Math.round((Date.now() - started) / evaluations.length)
        : 0,
    evaluations,
    decisions,
    paperworkTasks,
    audits: audit.list(),
    timeline: audit.timeline(),
    options: opts,
  };
}

async function processEvaluation(input: {
  evaluation: CandidateEvaluation;
  alreadySentOrActivePacket?: boolean;
  audit: EvaluationAuditLog;
  opts: ReturnType<typeof resolveOptions>;
  llmProvider?: LlmEnhancementProvider;
  dataQualityScore?: number | null;
  dataQualityIssues?: string[];
  preferHumanReview?: boolean;
}): Promise<{
  evaluation: CandidateEvaluation;
  decision: Decision;
  tasks: PaperworkTask[];
  llmApplied: boolean;
}> {
  const { audit, opts } = input;
  audit.recordEvaluation({
    candidateId: input.evaluation.candidateId,
    redactedCandidateId: input.evaluation.redactedCandidateId,
    recommendation: input.evaluation.recommendation,
    confidence: input.evaluation.confidence,
    reasonCodes: input.evaluation.reasonCodes,
    evidence: input.evaluation.evidence,
  });

  const enhanced = await maybeEnhanceWithLlm({
    evaluation: input.evaluation,
    enabled: opts.useLLMEnhancement,
    borderlineBelow: opts.llmBorderlineBelow,
    provider: input.llmProvider,
  });
  if (enhanced.applied && enhanced.insight) {
    audit.record(
      "llm_enhancement",
      `LLM insight provider=${enhanced.insight.provider} stub=${enhanced.insight.stub}`,
      { insight: enhanced.insight },
      input.evaluation.candidateId,
    );
  }

  const decision = decideFromEvaluation(enhanced.evaluation, {
    alreadySentOrActivePacket: input.alreadySentOrActivePacket,
    dataQualityScore: input.dataQualityScore,
    dataQualityIssues: input.dataQualityIssues,
    preferHumanReview: input.preferHumanReview,
  });
  audit.recordDecision({
    candidateId: decision.candidateId,
    outcome: decision.outcome,
    explanation: decision.explanation,
    automationReady: decision.automationReady,
  });

  // dryRun always plans only — never executes Dropbox / P71 writes from this module.
  const tasks = planPaperworkTasks(decision);
  if (tasks.length > 0) {
    audit.recordPaperworkPlan({
      candidateId: decision.candidateId,
      taskCount: tasks.length,
      idempotencyKeys: tasks.map((t) => t.idempotencyKey),
    });
  }

  return {
    evaluation: enhanced.evaluation,
    decision,
    tasks,
    llmApplied: enhanced.applied,
  };
}

/**
 * Primary orchestration entry — dry-run by default, LLM off by default.
 */
export async function orchestrate(input: {
  rows?: ScoredCandidateWorkflowRow[];
  breezyCandidates?: BreezyCandidate[];
  /** Pre-built P204 decisions (UI/demo / tests). */
  p204Evaluations?: P204QualificationDecision[];
  options?: OrchestrateOptions;
  llmProvider?: LlmEnhancementProvider;
}): Promise<OrchestrationResult> {
  const started = Date.now();
  const opts = resolveOptions(input.options);
  const audit = new EvaluationAuditLog({ batchId: opts.batchId });

  audit.record(
    "orchestration_start",
    `CEO orchestrate dryRun=${opts.dryRun} llm=${opts.useLLMEnhancement}`,
    {
      dryRun: opts.dryRun,
      useLLMEnhancement: opts.useLLMEnhancement,
      rowCount: input.rows?.length ?? 0,
      p204Count: input.p204Evaluations?.length ?? 0,
    },
  );

  const evaluations: CandidateEvaluation[] = [];
  const decisions: Decision[] = [];
  const paperworkTasks: PaperworkTask[] = [];
  let llmEnhancementsApplied = 0;

  if (input.rows?.length) {
    const emailCounts = buildEmailDuplicateIndex(input.breezyCandidates ?? []);
    const breezyById = new Map(
      (input.breezyCandidates ?? []).map((c) => [c.candidateId, c]),
    );
    for (const row of input.rows) {
      const dq = validateCandidateInputQuality({
        row,
        candidate: breezyById.get(row.candidateId) ?? null,
      });
      audit.recordDataQuality({
        candidateId: row.candidateId,
        score: dq.score,
        grade: dq.grade,
        summary: dq.summary,
        issues: dq.issues.map((i) => ({
          code: i.code,
          reason: i.reason,
          severity: i.severity,
        })),
      });

      let base: CandidateEvaluation;
      try {
        base = scoreCandidateRow({ row, emailCounts });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        audit.record(
          "error",
          `Soft-fail score: ${message}`,
          {
            dataQualityScore: dq.score,
            issues: dq.issues.map((i) => i.code),
          },
          row.candidateId,
        );
        // Continue with a conservative human_review path instead of aborting the batch.
        base = {
          candidateId: row.candidateId,
          redactedCandidateId: row.candidateId.slice(0, 12),
          workflowStatus: String(row.workflowStatus ?? "Applied"),
          recommendation: "needs_recruiter_review",
          confidence: Math.min(40, dq.score),
          reasonCodes: ["insufficient_enriched_signals", "hard_gate_fail_closed_to_review"],
          evidence: [message, dq.summary, ...dq.issues.map((i) => `${i.code}:${i.reason}`)],
          recommendedNextAction: "Remediate missing fields then re-score",
          components: {
            p193Decision: "Needs Review",
            p193Confidence: 0,
            p1934Decision: "Needs Review",
            p1934Confidence: 0,
            readinessScore: dq.score,
            readinessConfidence: dq.score,
            resumeScore: 0,
            questionnaireScore: 0,
            locationScore: 0,
            experienceYears: 0,
            nearestJobMiles: null,
            duplicateSuspect: false,
            fraudSpamScore: 0,
          },
        };
      }

      const processed = await processEvaluation({
        evaluation: base,
        alreadySentOrActivePacket: alreadySent(row),
        audit,
        opts,
        llmProvider: input.llmProvider,
        dataQualityScore: dq.score,
        dataQualityIssues: dq.issues.map((i) => `${i.code}:${i.reason}`),
        preferHumanReview: dq.preferHumanReview,
      });
      evaluations.push(processed.evaluation);
      decisions.push(processed.decision);
      paperworkTasks.push(...processed.tasks);
      if (processed.llmApplied) llmEnhancementsApplied += 1;
    }
  } else if (input.p204Evaluations?.length) {
    for (const evaluation of input.p204Evaluations) {
      const processed = await processEvaluation({
        evaluation,
        audit,
        opts,
        llmProvider: input.llmProvider,
      });
      evaluations.push(processed.evaluation);
      decisions.push(processed.decision);
      paperworkTasks.push(...processed.tasks);
      if (processed.llmApplied) llmEnhancementsApplied += 1;
    }
  }

  const result = summarize(
    evaluations,
    decisions,
    paperworkTasks,
    audit,
    started,
    opts,
    llmEnhancementsApplied,
  );

  audit.record(
    "orchestration_end",
    `Done evaluated=${result.evaluated} advance=${result.autoAdvance} review=${result.humanReview} reject=${result.autoReject}`,
    {
      traceId: result.traceId,
      batchId: result.batchId,
      llmEnhancementsApplied,
    },
  );
  // Refresh audits/timeline after end event
  result.audits = audit.list();
  result.timeline = audit.timeline();
  return result;
}
