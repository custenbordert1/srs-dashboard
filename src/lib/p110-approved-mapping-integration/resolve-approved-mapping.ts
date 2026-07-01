import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";

const PROJECT_BLOCKERS = new Set([
  "project_mapping_review",
  "project_not_mappable",
  "unpublished_job",
  "closed_job",
]);

export function resolveApprovedMapping(input: {
  record: P109ReviewDecisionRecord | null | undefined;
  candidateId: string;
  closedPositionId?: string | null;
  publishedJobTitleById?: Map<string, string>;
}): ApprovedMappingResolution | null {
  const record = input.record;
  if (!record) return null;
  if (record.decision !== "approved") {
    return null;
  }
  if (!record.recommendedPositionId?.trim()) {
    return null;
  }
  if (input.closedPositionId && record.closedPositionId !== input.closedPositionId) {
    return null;
  }
  if (record.candidateId !== input.candidateId) {
    return null;
  }

  return {
    qualifies: true,
    candidateId: record.candidateId,
    closedPositionId: record.closedPositionId,
    recommendedPositionId: record.recommendedPositionId,
    recommendedPositionTitle:
      input.publishedJobTitleById?.get(record.recommendedPositionId) ?? null,
    confidenceScore: record.confidenceScore,
    reviewer: record.reviewer,
    timestamp: record.timestamp,
    mappingReasons: record.mappingReasons,
    reason: `P109 approved mapping by ${record.reviewer} at ${record.timestamp}.`,
  };
}

export function listQualifiedApprovedMappings(
  records: P109ReviewDecisionRecord[],
  publishedJobTitleById?: Map<string, string>,
): ApprovedMappingResolution[] {
  return records
    .map((record) =>
      resolveApprovedMapping({
        record,
        candidateId: record.candidateId,
        publishedJobTitleById,
      }),
    )
    .filter((r): r is ApprovedMappingResolution => r !== null);
}

export function isProjectMappingBlocker(category: string): boolean {
  return PROJECT_BLOCKERS.has(category);
}

export function isReadyForSendBlocker(category: string): boolean {
  return category === "unknown_manual_review";
}
