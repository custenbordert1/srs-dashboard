import type { MappingReviewRecord } from "@/lib/p108-intelligent-project-mapping/types";

export type HistoricalMappingPattern = {
  sourcePositionId: string;
  recommendedPositionId: string;
  approvalCount: number;
  rejectCount: number;
};

export function buildHistoricalPatterns(
  records: MappingReviewRecord[],
): Map<string, HistoricalMappingPattern> {
  const patterns = new Map<string, HistoricalMappingPattern>();

  for (const record of records) {
    if (!record.recommendedPositionId) continue;
    const key = `${record.sourcePositionId}::${record.recommendedPositionId}`;
    const existing = patterns.get(key) ?? {
      sourcePositionId: record.sourcePositionId,
      recommendedPositionId: record.recommendedPositionId,
      approvalCount: 0,
      rejectCount: 0,
    };
    if (record.action === "approve") existing.approvalCount += 1;
    if (record.action === "reject") existing.rejectCount += 1;
    patterns.set(key, existing);
  }

  return patterns;
}

export function historicalPatternBonus(input: {
  patterns: Map<string, HistoricalMappingPattern>;
  sourcePositionId: string;
  recommendedPositionId: string;
}): { points: number; matched: boolean; detail: string } {
  const key = `${input.sourcePositionId}::${input.recommendedPositionId}`;
  const pattern = input.patterns.get(key);
  if (!pattern) {
    return { points: 0, matched: false, detail: "No historical match" };
  }
  if (pattern.approvalCount > 0 && pattern.rejectCount === 0) {
    return {
      points: 5,
      matched: true,
      detail: "Historical recruiter decision matched",
    };
  }
  if (pattern.approvalCount > pattern.rejectCount) {
    return {
      points: 3,
      matched: true,
      detail: "Prior recruiter approvals for this mapping",
    };
  }
  if (pattern.rejectCount > 0) {
    return { points: -3, matched: false, detail: "Prior recruiter rejections" };
  }
  return { points: 0, matched: false, detail: "No historical match" };
}
