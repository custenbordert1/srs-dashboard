import { findP109ReviewRecord, loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";

export function resolveApprovedMappingForCandidate(input: {
  candidateId: string;
  closedPositionId: string | null | undefined;
  records: Awaited<ReturnType<typeof loadP109ReviewRecords>>;
  publishedJobTitleById: Map<string, string>;
}) {
  return resolveApprovedMapping({
    record: findP109ReviewRecord(input.records, input.candidateId) ?? null,
    candidateId: input.candidateId,
    closedPositionId: input.closedPositionId,
    publishedJobTitleById: input.publishedJobTitleById,
  });
}
