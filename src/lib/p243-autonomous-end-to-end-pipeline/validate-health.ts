/**
 * P243 pipeline health check runner — dry-run before/after forceFreshReset.
 * Never live-sends; never persists idempotency.
 */
import { validateCandidateInputQuality } from "@/lib/candidate-evaluation-orchestrator/data-quality";
import {
  buildP243PipelineHealthReport,
  formatP243PipelineHealthMarkdown,
  type P243PipelineHealthReport,
} from "@/lib/p243-autonomous-end-to-end-pipeline/health";
import { pullPendingCandidates } from "@/lib/p243-autonomous-end-to-end-pipeline/pull";
import { runAutonomousRecruitingCycle } from "@/lib/p243-autonomous-end-to-end-pipeline/run";

export type P243PipelineHealthCheckOptions = {
  /** Sample size (default 15, max 50). */
  limit?: number;
  useLLMEnhancement?: boolean;
  positionIds?: string[];
  preferWebhooks?: boolean;
  enableSmartPoll?: boolean;
};

export type P243PipelineHealthCheckResult = {
  report: P243PipelineHealthReport;
  markdown: string;
};

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

/**
 * Run a small dry-run pair (no reset vs forceFreshReset), assess data quality
 * on the same pull sample, and build an Ops-ready health report.
 */
export async function runP243PipelineHealthCheck(
  options: P243PipelineHealthCheckOptions = {},
): Promise<P243PipelineHealthCheckResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT));

  // Shared pull for DQ + to document sample composition (recent + replayable rows).
  const pulled = await pullPendingCandidates({
    limit,
    positionIds: options.positionIds,
    preferWebhooks: options.preferWebhooks,
    enableSmartPoll: options.enableSmartPoll,
  });

  const breezyById = new Map(
    pulled.breezyLiveCandidates.map((c) => [c.candidateId, c]),
  );
  const dataQualityAssessments = pulled.rows.map((row) =>
    validateCandidateInputQuality({
      row,
      candidate: breezyById.get(row.candidateId) ?? null,
    }),
  );

  const shared = {
    dryRun: true as const,
    confirmLive: false,
    limit,
    useLLMEnhancement: Boolean(options.useLLMEnhancement),
    positionIds: options.positionIds,
    preferWebhooks: options.preferWebhooks,
    enableSmartPoll: options.enableSmartPoll,
    // Health check should observe qualification, not prior-cycle fingerprint skips.
    respectIdempotency: false,
  };

  const before = await runAutonomousRecruitingCycle({
    ...shared,
    forceFreshReset: false,
  });

  const after = await runAutonomousRecruitingCycle({
    ...shared,
    forceFreshReset: true,
  });

  const report = buildP243PipelineHealthReport({
    before,
    after,
    dataQualityAssessments,
    limit,
  });

  return {
    report,
    markdown: formatP243PipelineHealthMarkdown(report),
  };
}
