import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import { protectionBlockerOverridesApproval } from "@/lib/p109-project-mapping-review/approval-bridge";
import type { PaperworkBlockerCategory } from "@/lib/p106-autonomous-paperwork-engine/types";
import type { CandidateSafetyCheck } from "@/lib/p111-bulk-mapping-review/types";
import { P111_BULK_APPROVE_MIN_CONFIDENCE } from "@/lib/p111-bulk-mapping-review/types";

export function checkCandidateBulkApproveSafety(input: {
  item: ReviewWorkflowItem;
  baselineBlocker: string;
}): CandidateSafetyCheck {
  const blockers: string[] = [];

  if (input.item.confidenceScore < P111_BULK_APPROVE_MIN_CONFIDENCE) {
    blockers.push(`Confidence ${input.item.confidenceScore}% below ${P111_BULK_APPROVE_MIN_CONFIDENCE}% threshold`);
  }
  if (!input.item.recommendedPosition.positionId?.trim()) {
    blockers.push("No recommended active position");
  }
  if (protectionBlockerOverridesApproval(input.baselineBlocker as PaperworkBlockerCategory)) {
    if (input.baselineBlocker === "already_sent") blockers.push("Already sent");
    else if (input.baselineBlocker === "duplicate_risk") blockers.push("Duplicate risk");
    else if (input.baselineBlocker === "invalid_email") blockers.push("Invalid email");
    else blockers.push(`Protection blocker: ${input.baselineBlocker}`);
  }

  return {
    candidateId: input.item.candidateId,
    candidateName: input.item.candidateName,
    confidenceScore: input.item.confidenceScore,
    passesBulkApprove: blockers.length === 0,
    blockers,
    baselineBlocker: input.baselineBlocker,
  };
}

export function evaluateGroupBulkSafety(input: {
  members: ReviewWorkflowItem[];
  safetyByCandidate: Map<string, { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }>;
}): { bulkApprovable: boolean; blockers: string[] } {
  const blockers = new Set<string>();
  const states = new Set(input.members.map((m) => m.closedPosition.state.trim().toUpperCase()).filter(Boolean));

  if (states.size > 1) {
    blockers.add("Group spans multiple states");
  }

  for (const member of input.members) {
    const safety = input.safetyByCandidate.get(member.candidateId);
    if (!safety?.passesBulkApprove) {
      for (const b of safety?.blockers ?? ["Failed safety check"]) {
        blockers.add(b);
      }
    }
  }

  if (input.members.some((m) => !m.recommendedPosition.positionId)) {
    blockers.add("Missing recommended active position in group");
  }

  const minConfidence = Math.min(...input.members.map((m) => m.confidenceScore));
  if (minConfidence < P111_BULK_APPROVE_MIN_CONFIDENCE) {
    blockers.add(`Min confidence ${minConfidence}% below ${P111_BULK_APPROVE_MIN_CONFIDENCE}%`);
  }

  return {
    bulkApprovable: blockers.size === 0,
    blockers: [...blockers],
  };
}
