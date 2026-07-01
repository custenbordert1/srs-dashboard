import type { AutonomousPaperworkCandidateResult } from "@/lib/p106-autonomous-paperwork-engine/types";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import type { MappingApprovalStatus } from "@/lib/p109-project-mapping-review/types";
import type {
  RecoveryCategory,
  RecoveryCandidateAnalysis,
  RecoveryEffort,
} from "@/lib/p119-autonomous-recovery-engine/types";
import { scoreRecoveryValue } from "@/lib/p119-autonomous-recovery-engine/score-recovery-value";

export function classifyRecoveryCategory(input: {
  candidate: AutonomousPaperworkCandidateResult;
  approvalStatus: MappingApprovalStatus;
  approvedMapping: ApprovedMappingResolution | null;
  awaitingSignature: boolean;
  needsJobPublish: boolean;
}): {
  recoveryCategory: RecoveryCategory;
  recoveryReason: string;
  estimatedUnlock: number;
  estimatedEffort: RecoveryEffort;
  confidence: number;
  blockingSystem: string;
  recommendedNextAction: string;
} {
  const { candidate, approvalStatus, approvedMapping, awaitingSignature, needsJobPublish } = input;
  const blocker = candidate.blockerCategory;

  if (candidate.category === "sent" || blocker === "already_sent") {
    if (awaitingSignature) {
      return {
        recoveryCategory: "AWAITING_SIGNATURE",
        recoveryReason: "Paperwork sent — awaiting Dropbox signature.",
        estimatedUnlock: 0,
        estimatedEffort: "low",
        confidence: 90,
        blockingSystem: "P107 Paperwork Monitor",
        recommendedNextAction: "Wait for Signature",
      };
    }
    return {
      recoveryCategory: "READY_AFTER_SIGNATURE",
      recoveryReason: "Signature complete — ready for onboarding progression.",
      estimatedUnlock: 0,
      estimatedEffort: "low",
      confidence: 85,
      blockingSystem: "P107 Paperwork Monitor",
      recommendedNextAction: "Wait for Signature",
    };
  }

  if (blocker === "terminal_status") {
    return {
      recoveryCategory: "DO_NOT_RECOVER",
      recoveryReason: candidate.blockerReason ?? "Terminal workflow status.",
      estimatedUnlock: 0,
      estimatedEffort: "high",
      confidence: 95,
      blockingSystem: "P106 Workflow",
      recommendedNextAction: "Ignore",
    };
  }

  if (blocker === "invalid_email") {
    return {
      recoveryCategory: "INVALID_EMAIL",
      recoveryReason: candidate.blockerReason ?? "Invalid or missing email.",
      estimatedUnlock: 1,
      estimatedEffort: "low",
      confidence: 92,
      blockingSystem: "P106 Contact Validation",
      recommendedNextAction: "Fix Email",
    };
  }

  if (blocker === "duplicate_risk") {
    return {
      recoveryCategory: "DUPLICATE_RISK",
      recoveryReason: candidate.blockerReason ?? "Duplicate send protection.",
      estimatedUnlock: 0,
      estimatedEffort: "high",
      confidence: 88,
      blockingSystem: "P84 Duplicate Protection",
      recommendedNextAction: "Escalate",
    };
  }

  if (blocker === "unpublished_job" || needsJobPublish) {
    return {
      recoveryCategory: needsJobPublish ? "READY_AFTER_JOB_POSTED" : "UNPUBLISHED_JOB",
      recoveryReason: candidate.blockerReason ?? "No published job for candidate position.",
      estimatedUnlock: 1,
      estimatedEffort: "medium",
      confidence: 80,
      blockingSystem: "P90 Operational Queue",
      recommendedNextAction: "Publish Job",
    };
  }

  if (blocker === "closed_job") {
    return {
      recoveryCategory: "UNPUBLISHED_JOB",
      recoveryReason: candidate.blockerReason ?? "Closed ad without active published project.",
      estimatedUnlock: 1,
      estimatedEffort: "medium",
      confidence: 75,
      blockingSystem: "P108 Project Mapping",
      recommendedNextAction: "Publish Job",
    };
  }

  if (blocker === "project_not_mappable" || blocker === "project_mapping_review") {
    if (approvedMapping?.qualifies) {
      return {
        recoveryCategory: "REQUIRES_MAPPING_APPROVAL",
        recoveryReason: `P109 approved mapping to ${approvedMapping.recommendedPositionTitle ?? approvedMapping.recommendedPositionId} — bridge not active.`,
        estimatedUnlock: 1,
        estimatedEffort: "low",
        confidence: approvedMapping.confidenceScore,
        blockingSystem: "P109/P117 Mapping Bridge",
        recommendedNextAction: "Approve Mapping",
      };
    }
    if (approvalStatus === "rejected") {
      return {
        recoveryCategory: "DO_NOT_RECOVER",
        recoveryReason: "Mapping rejected by reviewer.",
        estimatedUnlock: 0,
        estimatedEffort: "high",
        confidence: 90,
        blockingSystem: "P109 Review",
        recommendedNextAction: "Reject Mapping",
      };
    }
    return {
      recoveryCategory: "REQUIRES_MAPPING_APPROVAL",
      recoveryReason: candidate.blockerReason ?? "Project mapping requires recruiter approval.",
      estimatedUnlock: 1,
      estimatedEffort: "medium",
      confidence: 70,
      blockingSystem: "P108/P109 Mapping",
      recommendedNextAction: "Approve Mapping",
    };
  }

  if (blocker === "p84_gate_failed" && candidate.autoRepairable) {
    return {
      recoveryCategory: "AUTO_RECOVERABLE",
      recoveryReason: candidate.blockerReason ?? "Operational recruiter/DM assignment gap.",
      estimatedUnlock: 1,
      estimatedEffort: "low",
      confidence: 85,
      blockingSystem: "P84/P106 Auto-Repair",
      recommendedNextAction: "Auto Repair",
    };
  }

  if (
    blocker === "call_first_required" ||
    blocker === "missing_resume" ||
    blocker === "missing_questionnaire" ||
    blocker === "unknown_manual_review" ||
    blocker === "p84_gate_failed"
  ) {
    return {
      recoveryCategory: "MANUAL_RECRUITER_REVIEW",
      recoveryReason: candidate.blockerReason ?? candidate.recommendedFix ?? "Manual recruiter action required.",
      estimatedUnlock: blocker === "p84_gate_failed" ? 1 : 0,
      estimatedEffort: "medium",
      confidence: 65,
      blockingSystem: "P83/P84 Advancement",
      recommendedNextAction: "Contact Candidate",
    };
  }

  return {
    recoveryCategory: "DO_NOT_RECOVER",
    recoveryReason: candidate.blockerReason ?? "No automated recovery path.",
    estimatedUnlock: 0,
    estimatedEffort: "high",
    confidence: 50,
    blockingSystem: "P106 Classifier",
    recommendedNextAction: "Ignore",
  };
}

export function buildRecoveryCandidateAnalysis(input: {
  candidate: AutonomousPaperworkCandidateResult;
  approvalStatus: MappingApprovalStatus;
  approvedMapping: ApprovedMappingResolution | null;
  awaitingSignature: boolean;
  needsJobPublish: boolean;
  mappingConfidence: number | null;
  coverageDemandScore: number;
  distanceMiles: number | null;
  duplicateRisk: boolean;
  alreadySent: boolean;
}): RecoveryCandidateAnalysis {
  const classified = classifyRecoveryCategory(input);
  const recoveryScore = scoreRecoveryValue({
    recoveryCategory: classified.recoveryCategory,
    estimatedUnlock: classified.estimatedUnlock,
    mappingConfidence: input.mappingConfidence ?? classified.confidence,
    coverageDemandScore: input.coverageDemandScore,
    distanceMiles: input.distanceMiles,
    duplicateRisk: input.duplicateRisk,
    alreadySent: input.alreadySent,
    autoRepairable: input.candidate.autoRepairable,
    candidateFreshnessDays: null,
    openCalls: 1,
  });

  return {
    candidateId: input.candidate.candidateId,
    candidateName: input.candidate.candidateName,
    positionId: input.candidate.positionId,
    positionTitle: input.candidate.positionTitle,
    blockerCategory: input.candidate.blockerCategory,
    ...classified,
    recoveryScore,
    autoRepairable: input.candidate.autoRepairable,
  };
}
