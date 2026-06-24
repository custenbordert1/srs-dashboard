import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { hoursSince } from "@/lib/candidate-action-sla";
import type {
  ExecutivePaperworkStageId,
  PaperworkSourceOfTruth,
} from "@/lib/executive-paperwork-dashboard/types";

export type PaperworkStageInput = {
  row: Pick<
    ScoredCandidateWorkflowRow,
    | "candidateId"
    | "workflowStatus"
    | "paperworkStatus"
    | "paperworkError"
    | "signatureRequestId"
    | "paperworkSentAt"
    | "paperworkViewedAt"
    | "paperworkSignedAt"
    | "actionType"
    | "actionGeneratedAt"
  >;
  onboarding: CandidateOnboardingRecord | null;
};

export function classifyPaperworkStage(input: PaperworkStageInput): ExecutivePaperworkStageId | null {
  const { row, onboarding } = input;
  const onboardingStatus = onboarding?.status ?? null;

  if (
    onboardingStatus === "failed" ||
    onboardingStatus === "declined" ||
    row.paperworkStatus === "failed" ||
    Boolean(row.paperworkError?.trim())
  ) {
    return "failed";
  }

  if (onboardingStatus === "expired") {
    return "expired";
  }

  if (
    onboardingStatus === "completed" ||
    onboardingStatus === "ready_for_mel" ||
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Signed"
  ) {
    return "signed";
  }

  if (onboardingStatus === "viewed" || onboardingStatus === "partially_completed" || row.paperworkStatus === "viewed") {
    return "viewed";
  }

  if (
    onboardingStatus === "sent" ||
    row.paperworkStatus === "sent" ||
    row.workflowStatus === "Paperwork Sent"
  ) {
    return "sent";
  }

  if (onboardingStatus === "pending_approval") {
    return "approvalQueue";
  }

  const actionType = row.actionType ?? "none";
  if (
    actionType === "send-paperwork" ||
    actionType === "await-signature" ||
    onboardingStatus === "draft" ||
    row.workflowStatus === "Paperwork Needed"
  ) {
    return "awaitingRecruiterAction";
  }

  return null;
}

export function detectPaperworkDrift(input: PaperworkStageInput): {
  hasDrift: boolean;
  driftReason: string | null;
  sourceOfTruth: PaperworkSourceOfTruth;
} {
  const { row, onboarding } = input;
  if (!onboarding) {
    return { hasDrift: false, driftReason: null, sourceOfTruth: "reconciled" };
  }

  const reasons: string[] = [];
  const workflowSent =
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Paperwork Sent" ||
    row.workflowStatus === "Signed";
  const onboardingQueued = onboarding.status === "pending_approval" || onboarding.status === "draft";

  if (workflowSent && onboardingQueued) {
    reasons.push(`workflow advanced (${row.paperworkStatus}) but onboarding is ${onboarding.status}`);
  }

  if (
    onboarding.status === "sent" ||
    onboarding.status === "viewed" ||
    onboarding.status === "partially_completed" ||
    onboarding.status === "completed"
  ) {
    if (row.paperworkStatus === "not_sent" && row.workflowStatus !== "Paperwork Sent") {
      reasons.push(`onboarding is ${onboarding.status} but workflow paperwork is ${row.paperworkStatus}`);
    }
  }

  if (row.signatureRequestId && onboarding.signatureRequestId && row.signatureRequestId !== onboarding.signatureRequestId) {
    reasons.push("signature request IDs differ between workflow and onboarding");
  }

  if (reasons.length === 0) {
    return { hasDrift: false, driftReason: null, sourceOfTruth: "reconciled" };
  }

  let sourceOfTruth: PaperworkSourceOfTruth = "reconciled";
  if (workflowSent && onboardingQueued) {
    sourceOfTruth = "workflow";
  } else if (
    onboarding.status === "sent" ||
    onboarding.status === "viewed" ||
    onboarding.status === "completed"
  ) {
    sourceOfTruth = "onboarding";
  }

  return {
    hasDrift: true,
    driftReason: reasons.join("; "),
    sourceOfTruth,
  };
}

export function resolveAgeInStageHours(
  stage: ExecutivePaperworkStageId,
  input: PaperworkStageInput,
  referenceMs = Date.now(),
): number | null {
  const { row, onboarding } = input;

  switch (stage) {
    case "approvalQueue":
      return hoursSince(onboarding?.createdAt ?? null, referenceMs);
    case "sent":
      return hoursSince(onboarding?.sentAt ?? row.paperworkSentAt, referenceMs);
    case "viewed":
      return hoursSince(row.paperworkViewedAt ?? onboarding?.sentAt ?? row.paperworkSentAt, referenceMs);
    case "signed":
      return hoursSince(
        row.paperworkSignedAt ?? onboarding?.completedAt ?? onboarding?.sentAt ?? null,
        referenceMs,
      );
    case "failed":
      return hoursSince(onboarding?.failedAt ?? null, referenceMs);
    case "expired": {
      const expiredAt = onboarding?.statusHistory
        ?.slice()
        .reverse()
        .find((entry) => entry.status === "expired")?.at;
      return hoursSince(expiredAt ?? onboarding?.createdAt ?? null, referenceMs);
    }
    case "awaitingRecruiterAction":
      return hoursSince(row.actionGeneratedAt ?? onboarding?.createdAt ?? null, referenceMs);
    default:
      return null;
  }
}

export function resolveExceptionReason(
  stage: ExecutivePaperworkStageId,
  input: PaperworkStageInput,
): string | null {
  const { row, onboarding } = input;

  if (stage === "failed") {
    return onboarding?.failureReason ?? row.paperworkError ?? "Paperwork failed";
  }
  if (stage === "expired") {
    return "Packet expired before completion";
  }
  if (stage === "awaitingRecruiterAction") {
    if (row.actionType === "send-paperwork") return "Send-paperwork action pending recruiter follow-through";
    if (row.actionType === "await-signature") return "Awaiting signature follow-up";
    if (onboarding?.status === "draft") return "Onboarding draft not submitted for approval";
    if (row.workflowStatus === "Paperwork Needed") return "Paperwork needed — no packet queued";
  }
  return null;
}
