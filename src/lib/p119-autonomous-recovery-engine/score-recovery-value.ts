import type { RecoveryCategory } from "@/lib/p119-autonomous-recovery-engine/types";

const CATEGORY_BASE: Record<RecoveryCategory, number> = {
  AUTO_RECOVERABLE: 85,
  REQUIRES_MAPPING_APPROVAL: 75,
  READY_AFTER_JOB_POSTED: 70,
  UNPUBLISHED_JOB: 65,
  MANUAL_RECRUITER_REVIEW: 45,
  INVALID_EMAIL: 40,
  AWAITING_SIGNATURE: 30,
  READY_AFTER_SIGNATURE: 25,
  DUPLICATE_RISK: 10,
  DO_NOT_RECOVER: 0,
};

export function scoreRecoveryValue(input: {
  recoveryCategory: RecoveryCategory;
  estimatedUnlock: number;
  mappingConfidence: number;
  coverageDemandScore: number;
  distanceMiles: number | null;
  duplicateRisk: boolean;
  alreadySent: boolean;
  autoRepairable: boolean;
  candidateFreshnessDays: number | null;
  openCalls: number;
}): number {
  let score = CATEGORY_BASE[input.recoveryCategory];

  if (input.estimatedUnlock > 0) score += 8;
  if (input.autoRepairable) score += 10;
  if (input.mappingConfidence >= 80) score += 6;
  else if (input.mappingConfidence >= 70) score += 3;

  score += Math.min(10, Math.round(input.coverageDemandScore / 10));
  score += Math.min(8, input.openCalls * 2);

  if (input.candidateFreshnessDays != null && input.candidateFreshnessDays <= 7) {
    score += 5;
  } else if (input.candidateFreshnessDays != null && input.candidateFreshnessDays <= 30) {
    score += 2;
  }

  if (input.distanceMiles != null) {
    if (input.distanceMiles <= 25) score += 4;
    else if (input.distanceMiles <= 75) score += 2;
    else if (input.distanceMiles > 150) score -= 3;
  }

  if (input.duplicateRisk) score -= 25;
  if (input.alreadySent) score -= 20;

  return Math.max(0, Math.min(100, Math.round(score)));
}
