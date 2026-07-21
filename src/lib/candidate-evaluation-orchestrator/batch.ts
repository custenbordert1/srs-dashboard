import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { orchestrate } from "@/lib/candidate-evaluation-orchestrator/orchestrate";
import type {
  OrchestrationBatchResult,
  OrchestrateOptions,
} from "@/lib/candidate-evaluation-orchestrator/types";
import type { P204QualificationDecision } from "@/lib/p204-ai-candidate-qualification/types";

function toBatchResult(
  result: Awaited<ReturnType<typeof orchestrate>>,
): OrchestrationBatchResult {
  return {
    mode: "dry_run",
    evaluated: result.evaluated,
    autoAdvance: result.autoAdvance,
    humanReview: result.humanReview,
    autoReject: result.autoReject,
    paperworkTasksPlanned: result.paperworkTasksPlanned,
    averageLatencyMs: result.averageLatencyMs,
    evaluations: result.evaluations,
    decisions: result.decisions,
    paperworkTasks: result.paperworkTasks,
    audits: result.audits,
  };
}

/**
 * @deprecated Prefer `orchestrate({ rows, options })`.
 * Kept for zero breaking changes.
 */
export async function orchestrateEvaluationFromRows(input: {
  rows: ScoredCandidateWorkflowRow[];
  breezyCandidates?: BreezyCandidate[];
  options?: OrchestrateOptions;
}): Promise<OrchestrationBatchResult> {
  const result = await orchestrate({
    rows: input.rows,
    breezyCandidates: input.breezyCandidates,
    options: { dryRun: true, ...input.options },
  });
  return toBatchResult(result);
}

/**
 * @deprecated Prefer `orchestrate({ p204Evaluations, options })`.
 */
export async function orchestrateFromP204Decisions(
  evaluations: P204QualificationDecision[],
  options?: OrchestrateOptions,
): Promise<OrchestrationBatchResult> {
  const result = await orchestrate({
    p204Evaluations: evaluations,
    options: { dryRun: true, ...options },
  });
  return toBatchResult(result);
}
