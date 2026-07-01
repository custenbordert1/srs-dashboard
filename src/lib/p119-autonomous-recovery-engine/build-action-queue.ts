import type {
  RecoveryActionQueueItem,
  RecoveryActionType,
  RecoveryCandidateAnalysis,
  RecoveryCategory,
} from "@/lib/p119-autonomous-recovery-engine/types";

const ACTION_EFFORT_MINUTES: Record<RecoveryActionType, number> = {
  "Auto Repair": 2,
  "Approve Mapping": 5,
  "Publish Job": 20,
  "Contact Candidate": 15,
  "Fix Email": 5,
  "Wait for Signature": 1,
  "Reject Mapping": 3,
  Escalate: 25,
  Ignore: 0,
};

function actionTypeForCategory(category: RecoveryCategory): RecoveryActionType {
  switch (category) {
    case "AUTO_RECOVERABLE":
      return "Auto Repair";
    case "REQUIRES_MAPPING_APPROVAL":
      return "Approve Mapping";
    case "UNPUBLISHED_JOB":
    case "READY_AFTER_JOB_POSTED":
      return "Publish Job";
    case "INVALID_EMAIL":
      return "Fix Email";
    case "AWAITING_SIGNATURE":
    case "READY_AFTER_SIGNATURE":
      return "Wait for Signature";
    case "DUPLICATE_RISK":
      return "Escalate";
    case "MANUAL_RECRUITER_REVIEW":
      return "Contact Candidate";
    case "DO_NOT_RECOVER":
      return "Ignore";
    default:
      return "Escalate";
  }
}

function businessImpact(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function buildActionQueue(candidates: RecoveryCandidateAnalysis[]): RecoveryActionQueueItem[] {
  const groups = new Map<
    string,
    {
      actionType: RecoveryActionType;
      recoveryCategories: Set<RecoveryCategory>;
      candidateIds: string[];
      unlock: number;
      scoreTotal: number;
      reasons: string[];
    }
  >();

  for (const candidate of candidates) {
    if (candidate.recoveryCategory === "DO_NOT_RECOVER" && candidate.estimatedUnlock === 0) {
      continue;
    }
    const actionType = actionTypeForCategory(candidate.recoveryCategory);
    const key = `${actionType}::${candidate.positionId ?? "unknown"}::${candidate.recoveryCategory}`;
    const existing = groups.get(key) ?? {
      actionType,
      recoveryCategories: new Set<RecoveryCategory>(),
      candidateIds: [],
      unlock: 0,
      scoreTotal: 0,
      reasons: [],
    };
    existing.recoveryCategories.add(candidate.recoveryCategory);
    existing.candidateIds.push(candidate.candidateId);
    existing.unlock += candidate.estimatedUnlock;
    existing.scoreTotal += candidate.recoveryScore;
    if (existing.reasons.length < 3) {
      existing.reasons.push(candidate.recoveryReason);
    }
    groups.set(key, existing);
  }

  const queue: RecoveryActionQueueItem[] = [...groups.entries()].map(([key, group]) => {
    const avgScore = group.candidateIds.length
      ? group.scoreTotal / group.candidateIds.length
      : 0;
    const recruiterMinutes =
      ACTION_EFFORT_MINUTES[group.actionType] +
      Math.max(0, group.candidateIds.length - 1) * 2;
    const roi = group.unlock > 0 ? (avgScore * group.unlock) / Math.max(recruiterMinutes, 1) : 0;

    return {
      actionId: key,
      actionType: group.actionType,
      priority: Math.round(roi * 100 + avgScore),
      expectedUnlockCount: group.unlock,
      estimatedPaperworkIncrease: group.unlock,
      estimatedRecruiterMinutes: recruiterMinutes,
      businessImpact: businessImpact(avgScore),
      reason: group.reasons.join(" | "),
      candidateIds: group.candidateIds,
      recoveryCategories: [...group.recoveryCategories],
      sourcePhase: "P119",
    };
  });

  return queue.sort((left, right) => right.priority - left.priority);
}

export function estimateRecruiterHoursSaved(actions: RecoveryActionQueueItem[]): number {
  const autoMinutes = actions
    .filter((action) => action.actionType === "Auto Repair")
    .reduce((sum, action) => sum + action.estimatedRecruiterMinutes * action.expectedUnlockCount, 0);
  return Math.round((autoMinutes / 60) * 10) / 10;
}
