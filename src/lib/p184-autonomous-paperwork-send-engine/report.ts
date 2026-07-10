import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  P184EngineMode,
  P184QueuePriority,
  P184RateLimitStatus,
  P184RejectionBucket,
  P184ValidationReport,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { P184_SOURCE_PHASE } from "@/lib/p184-autonomous-paperwork-send-engine/types";

export function buildP184RejectionBuckets(
  rejected: Array<{ candidateId: string; reasons: string[] }>,
): P184RejectionBucket[] {
  const map = new Map<string, P184RejectionBucket>();
  for (const item of rejected) {
    for (const reason of item.reasons) {
      const existing = map.get(reason);
      if (existing) {
        existing.count += 1;
        existing.candidateIds.push(item.candidateId);
      } else {
        map.set(reason, { reason, count: 1, candidateIds: [item.candidateId] });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export function estimateP184CompletionMinutes(input: {
  projectedSends: number;
  rateLimitStatus: P184RateLimitStatus;
}): number | null {
  if (input.projectedSends <= 0) return 0;
  const perMinute = Math.max(1, input.rateLimitStatus.config.maxPerMinute);
  const perHour = Math.max(1, input.rateLimitStatus.config.maxPerHour);
  const minuteBound = Math.ceil(input.projectedSends / perMinute);
  const hourBoundMinutes = Math.ceil(input.projectedSends / perHour) * 60;
  return Math.max(minuteBound, Math.ceil(hourBoundMinutes / Math.max(1, Math.ceil(perHour / perMinute))));
}

export function buildP184ValidationReport(input: {
  mode: P184EngineMode;
  candidates: ScoredCandidateWorkflowRow[];
  eligible: Array<{
    candidateId: string;
    candidateName: string;
    priority: P184QueuePriority;
    idempotencyKey: string;
  }>;
  rejected: Array<{ candidateId: string; candidateName: string; reasons: string[] }>;
  queueOrder: string[];
  rateLimitStatus: P184RateLimitStatus;
  maxSendsPerCycle: number;
  warnings?: string[];
}): P184ValidationReport {
  const projectedSends = Math.min(input.eligible.length, input.maxSendsPerCycle);
  const warnings = [...(input.warnings ?? [])];
  if (input.rateLimitStatus.limited) {
    warnings.push(`Rate limited by: ${input.rateLimitStatus.limitedBy.join(", ")}`);
  }
  if (input.mode === "dry_run") {
    warnings.push("Dry run mode — validations only; Dropbox Sign not called.");
  }

  return {
    phase: P184_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    evaluated: input.candidates.length,
    eligible: input.eligible,
    rejected: input.rejected,
    rejectionReasons: buildP184RejectionBuckets(input.rejected),
    queueOrder: input.queueOrder,
    projectedSends,
    estimatedCompletionMinutes: estimateP184CompletionMinutes({
      projectedSends,
      rateLimitStatus: input.rateLimitStatus,
    }),
    rateLimitStatus: input.rateLimitStatus,
    warnings,
  };
}

export function formatP184Markdown(report: P184ValidationReport): string {
  const lines = [
    `# ${report.phase} Autonomous Paperwork Send Validation`,
    "",
    `- Generated: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- Evaluated: ${report.evaluated}`,
    `- Eligible: ${report.eligible.length}`,
    `- Rejected: ${report.rejected.length}`,
    `- Projected sends: ${report.projectedSends}`,
    `- Estimated completion (min): ${report.estimatedCompletionMinutes ?? "n/a"}`,
    "",
    "## Top rejection reasons",
    ...report.rejectionReasons.slice(0, 10).map((r) => `- ${r.reason}: ${r.count}`),
    "",
    "## Queue order (first 25)",
    ...report.queueOrder.slice(0, 25).map((id, i) => `${i + 1}. ${id}`),
  ];
  return `${lines.join("\n")}\n`;
}
