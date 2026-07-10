import { saveP109ReviewDecision } from "@/lib/p109-project-mapping-review/review-decision-store";
import type { P109ReviewDecision, P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import { P111_BULK_APPROVE_MIN_CONFIDENCE } from "@/lib/p111-bulk-mapping-review/types";
import { evaluateGroupBulkSafety } from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";

export async function applyBulkGroupDecision(input: {
  group: BulkReviewGroup;
  action: P109ReviewDecision;
  sharedNote: string;
  reviewer: string;
  safetyByCandidate: Map<string, { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }>;
}): Promise<{ ok: boolean; records: P109ReviewDecisionRecord[]; error?: string }> {
  if (input.action === "approved") {
    const safety = evaluateGroupBulkSafety({
      members: input.group.members,
      safetyByCandidate: input.safetyByCandidate,
    });
    if (!safety.bulkApprovable) {
      return {
        ok: false,
        records: [],
        error: `Bulk approve blocked: ${safety.blockers.join("; ")}`,
      };
    }
  }

  const records: P109ReviewDecisionRecord[] = [];
  const note =
    input.sharedNote.trim() ||
    `P111 bulk ${input.action} — group ${input.group.groupId.slice(0, 48)}`;

  for (const member of input.group.members) {
    if (input.action === "approved" && member.confidenceScore < P111_BULK_APPROVE_MIN_CONFIDENCE) {
      return {
        ok: false,
        records,
        error: `Candidate ${member.candidateId} below confidence threshold.`,
      };
    }

    const record = await saveP109ReviewDecision({
      candidateId: member.candidateId,
      candidateName: member.candidateName,
      closedPositionId: member.closedPosition.positionId,
      recommendedPositionId: member.recommendedPosition.positionId,
      decision: input.action,
      reviewer: input.reviewer,
      notes: note,
      confidenceScore: member.confidenceScore,
      mappingReasons: member.mappingReasons,
      mappingDecision: member.mappingDecision,
      factorScores: member.factorScores,
    });
    records.push(record);
  }

  return { ok: true, records };
}
