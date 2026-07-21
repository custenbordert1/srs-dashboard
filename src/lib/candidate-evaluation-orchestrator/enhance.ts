import type {
  CandidateEvaluation,
  LlmInsight,
} from "@/lib/candidate-evaluation-orchestrator/types";

export const DEFAULT_LLM_BORDERLINE_BELOW = 75;

export type LlmEnhancementProvider = (input: {
  evaluation: CandidateEvaluation;
}) => Promise<LlmInsight>;

/**
 * Optional multi-LLM enhancement layer.
 *
 * OFF BY DEFAULT. When enabled, only borderline P204 confidences
 * (< llmBorderlineBelow, default 75) are considered.
 *
 * Real providers can be injected; the default stub returns a commented no-op
 * insight so dry-runs stay fast and deterministic.
 *
 * // Example future provider (intentionally commented — do not enable in prod without auth):
 * // async function openAiBorderlineReview({ evaluation }) {
 * //   const res = await fetch("https://api.openai.com/v1/chat/completions", { ... });
 * //   return { provider: "openai", model: "gpt-4.1-mini", summary: "...", ... };
 * // }
 */
export async function maybeEnhanceWithLlm(input: {
  evaluation: CandidateEvaluation;
  enabled: boolean;
  borderlineBelow?: number;
  provider?: LlmEnhancementProvider;
}): Promise<{ evaluation: CandidateEvaluation; applied: boolean; insight: LlmInsight | null }> {
  const threshold = input.borderlineBelow ?? DEFAULT_LLM_BORDERLINE_BELOW;
  if (!input.enabled) {
    return { evaluation: input.evaluation, applied: false, insight: null };
  }
  if (input.evaluation.confidence >= threshold) {
    return { evaluation: input.evaluation, applied: false, insight: null };
  }

  const started = Date.now();
  const insight = input.provider
    ? await input.provider({ evaluation: input.evaluation })
    : ({
        provider: "stub-disabled-by-default",
        model: null,
        summary:
          "LLM enhancement stub — no external call. Enable a provider only under supervised dry-run.",
        confidenceDelta: 0,
        suggestedOutcome: null,
        latencyMs: Date.now() - started,
        stub: true,
      } satisfies LlmInsight);

  return {
    evaluation: { ...input.evaluation, llmInsight: insight },
    applied: true,
    insight,
  };
}
