import { extractJobSignals } from "@/lib/p108-intelligent-project-mapping/extract-job-signals";
import { normalizePositionTitle } from "@/lib/test-cohort-validation/normalize-position-title";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import type { BulkReviewGroup, ConfidenceBand } from "@/lib/p111-bulk-mapping-review/types";
import { evaluateGroupBulkSafety } from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";

export function resolveConfidenceBand(score: number): ConfidenceBand {
  if (score >= 80) return "high_80_plus";
  if (score >= 65) return "approvable_65_79";
  if (score >= 50) return "review_50_64";
  return "low_below_50";
}

export function buildBulkGroupId(input: {
  closedTitle: string;
  recommendedPositionId: string | null;
  city: string;
  state: string;
  confidenceBand: ConfidenceBand;
  client: string | null;
}): string {
  return [
    normalizePositionTitle(input.closedTitle),
    input.recommendedPositionId ?? "none",
    normalizePositionTitle(input.city),
    input.state.trim().toUpperCase(),
    input.confidenceBand,
    normalizePositionTitle(input.client ?? "unknown"),
  ].join("::");
}

export function groupPendingReviewItems(
  items: ReviewWorkflowItem[],
  safetyByCandidate: Map<string, { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }>,
): BulkReviewGroup[] {
  const pending = items.filter((i) => i.approvalStatus === "pending");
  const groups = new Map<string, ReviewWorkflowItem[]>();

  for (const item of pending) {
    const client = extractJobSignals(item.closedPosition.title).client;
    const band = resolveConfidenceBand(item.confidenceScore);
    const groupId = buildBulkGroupId({
      closedTitle: item.closedPosition.title,
      recommendedPositionId: item.recommendedPosition.positionId,
      city: item.closedPosition.city,
      state: item.closedPosition.state,
      confidenceBand: band,
      client,
    });
    const existing = groups.get(groupId) ?? [];
    existing.push(item);
    groups.set(groupId, existing);
  }

  return [...groups.entries()]
    .map(([groupId, members]) => {
      const first = members[0]!;
      const client = extractJobSignals(first.closedPosition.title).client;
      const scores = members.map((m) => m.confidenceScore);
      const safety = evaluateGroupBulkSafety({
        members,
        safetyByCandidate,
      });

      return {
        groupId,
        closedPositionTitle: first.closedPosition.title,
        closedPositionId: first.closedPosition.positionId,
        recommendedPositionId: first.recommendedPosition.positionId,
        recommendedPositionTitle: first.recommendedPosition.title,
        city: first.closedPosition.city,
        state: first.closedPosition.state,
        confidenceBand: resolveConfidenceBand(Math.min(...scores)),
        client,
        averageConfidence: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        minConfidence: Math.min(...scores),
        candidateCount: members.length,
        candidateIds: members.map((m) => m.candidateId),
        members,
        bulkApprovable: safety.bulkApprovable,
        bulkApproveBlockers: safety.blockers,
        individualReviewOnly: !safety.bulkApprovable,
      };
    })
    .sort((a, b) => b.candidateCount - a.candidateCount || b.averageConfidence - a.averageConfidence);
}
