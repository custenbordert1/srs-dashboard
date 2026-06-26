import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isEligibleForSend } from "@/lib/candidate-onboarding-engine/build-onboarding-decisions";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import type {
  PaperworkAutoEligibilityResult,
  PaperworkEligibilityRequirement,
  PaperworkLifecycleStatus,
  PaperworkSendSource,
} from "@/lib/autonomous-paperwork-engine/types";

export function lifecycleStatusLabel(status: PaperworkLifecycleStatus): string {
  const labels: Record<PaperworkLifecycleStatus, string> = {
    eligible: "Eligible",
    queued: "Queued",
    generating: "Generating",
    sent: "Sent",
    viewed: "Viewed",
    signed: "Signed",
    expired: "Expired",
    failed: "Failed",
    cancelled: "Cancelled",
    needs_recruiter_review: "Needs Recruiter Review",
  };
  return labels[status];
}

export function resolvePaperworkSendSource(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
}): PaperworkSendSource {
  if (!input.row.paperworkSentAt && !input.onboarding?.sentAt) return "unknown";

  if (input.onboarding?.orchestratorRunId) return "auto";
  if (
    input.onboarding?.statusHistory.some(
      (entry) =>
        entry.status === "queued" ||
        entry.status === "sending" ||
        entry.status === "retry_scheduled" ||
        /queue|worker|auto/i.test(entry.detail ?? ""),
    )
  ) {
    return "auto";
  }

  return "manual";
}

export function resolvePaperworkLifecycleStatus(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
}): PaperworkLifecycleStatus {
  const onboardingStatus = input.onboarding?.status ?? null;

  if (onboardingStatus === "declined") return "cancelled";
  if (onboardingStatus === "sending") return "generating";
  if (
    onboardingStatus === "queued" ||
    onboardingStatus === "retry_scheduled" ||
    onboardingStatus === "pending_approval"
  ) {
    return "queued";
  }

  const stage = classifyPaperworkStage({ row: input.row, onboarding: input.onboarding });
  if (stage === "failed") return "failed";
  if (stage === "expired") return "expired";
  if (stage === "signed") return "signed";
  if (stage === "viewed") return "viewed";
  if (stage === "sent") return "sent";

  const eligibility = buildPaperworkAutoEligibility({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
  });
  if (eligibility.eligible) return "eligible";
  if (stage === "approvalQueue" || stage === "awaitingRecruiterAction") {
    return "needs_recruiter_review";
  }

  return eligibility.status === "needs_recruiter_review" ? "needs_recruiter_review" : "eligible";
}

export function buildPaperworkAutoEligibility(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
}): PaperworkAutoEligibilityResult {
  const requirements: PaperworkEligibilityRequirement[] = [];

  const recruiterApproved =
    !isUnassignedRecruiter(input.row.assignedRecruiter ?? "") && Boolean(input.row.actionGeneratedAt);
  requirements.push({
    id: "recruiter_approved",
    label: "Recruiter approved",
    complete: recruiterApproved,
    blocking: true,
    detail: recruiterApproved ? null : "Recruiter approval or assignment missing.",
  });

  const gradeOk = isGradeAllowedForPaperwork(input.row.aiGrade, input.policy.paperworkByGrade);
  requirements.push({
    id: "grade_threshold",
    label: "Candidate grade meets threshold",
    complete: gradeOk,
    blocking: true,
    detail: gradeOk ? null : `Grade ${input.row.aiGrade} not eligible for automatic paperwork.`,
  });

  const hasEmail = Boolean(input.row.email?.trim());
  requirements.push({
    id: "required_fields",
    label: "Required fields complete",
    complete: hasEmail,
    blocking: true,
    detail: hasEmail ? null : "Missing candidate email.",
  });

  const duplicateReason = duplicatePaperworkSendBlockReason({
    workflow: {
      candidateId: input.row.candidateId,
      paperworkStatus: input.row.paperworkStatus,
      workflowStatus: input.row.workflowStatus,
      signatureRequestId: input.row.signatureRequestId,
    } as never,
    activeOnboarding: input.onboarding,
  });
  const noDuplicate = duplicateReason == null;
  requirements.push({
    id: "no_duplicate",
    label: "No duplicate paperwork",
    complete: noDuplicate,
    blocking: true,
    detail: duplicateReason,
  });

  const notSigned =
    input.row.paperworkStatus !== "signed" && input.row.workflowStatus !== "Signed";
  requirements.push({
    id: "not_signed",
    label: "Not already signed",
    complete: notSigned,
    blocking: true,
    detail: notSigned ? null : "Paperwork already signed.",
  });

  const policyApprovalOk =
    !input.policy.send.requireApproval || input.onboarding?.status !== "pending_approval";
  requirements.push({
    id: "approval_gate",
    label: "Approval gate satisfied",
    complete: policyApprovalOk,
    blocking: true,
    detail: policyApprovalOk ? null : "Awaiting recruiter approval for send.",
  });

  const missingReasons = requirements
    .filter((row) => row.blocking && !row.complete)
    .map((row) => row.detail ?? row.label);

  const eligible = isEligibleForSend(input.row, input.policy) && missingReasons.length === 0;

  return {
    candidateId: input.row.candidateId,
    eligible,
    status: eligible ? "ready_for_auto_send" : "needs_recruiter_review",
    requirements,
    missingReasons,
  };
}
