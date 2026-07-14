import type { OnboardingPacketStatus } from "@/lib/candidate-onboarding-engine/types";
import type {
  CandidateWorkflowRecord,
  CandidateWorkflowStatus,
  PaperworkStatus,
} from "@/lib/candidate-workflow-types";
import { decideOwnershipWrite } from "@/lib/p188-4-recruiter-ownership-durability/precedence";

/** Workflow stages that must not be downgraded by ingestion/automation. */
export const ADVANCED_WORKFLOW_STATUSES = new Set<CandidateWorkflowStatus>([
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
]);

/** Early intake statuses that must not overwrite advanced paperwork workflow stages. */
export const REGRESSIVE_WORKFLOW_STATUSES = new Set<CandidateWorkflowStatus>([
  "Applied",
  "Needs Review",
]);

export const ADVANCED_PAPERWORK_STATUSES = new Set<PaperworkStatus>(["sent", "viewed", "signed"]);

const PAPERWORK_STATUS_RANK: Record<PaperworkStatus, number> = {
  not_sent: 0,
  sent: 1,
  viewed: 2,
  signed: 3,
  declined: 4,
  failed: 4,
};

const ONBOARDING_STATUS_RANK: Record<OnboardingPacketStatus, number> = {
  draft: 0,
  pending_approval: 1,
  queued: 1,
  retry_scheduled: 1,
  sending: 1,
  sent: 2,
  viewed: 3,
  partially_completed: 3,
  completed: 4,
  ready_for_mel: 4,
  declined: 4,
  expired: 4,
  failed: 4,
};

export function resolveAssignedRecruiter(
  incoming: string | undefined,
  existing: CandidateWorkflowRecord | undefined,
  options?: {
    incomingSource?: CandidateWorkflowRecord["recruiterAssignmentSource"];
    allowForceOverwrite?: boolean;
  },
): string {
  const decision = decideOwnershipWrite({
    incomingRecruiter: incoming,
    incomingSource: options?.incomingSource ?? null,
    existingRecruiter: existing?.assignedRecruiter,
    existingSource: existing?.recruiterAssignmentSource,
    allowForceOverwrite: options?.allowForceOverwrite,
  });
  return decision.recruiter;
}

export function isWorkflowStatusRegression(
  incoming: CandidateWorkflowStatus,
  existing: CandidateWorkflowStatus | undefined,
): boolean {
  if (!existing) return false;
  if (!ADVANCED_WORKFLOW_STATUSES.has(existing)) return false;
  return REGRESSIVE_WORKFLOW_STATUSES.has(incoming);
}

export function resolveWorkflowStatus(
  incoming: CandidateWorkflowStatus | undefined,
  existing: CandidateWorkflowRecord | undefined,
  force = false,
): CandidateWorkflowStatus {
  const fallback = existing?.workflowStatus ?? "Needs Review";
  if (incoming === undefined) return fallback;
  if (force) return incoming;
  if (isWorkflowStatusRegression(incoming, existing?.workflowStatus)) {
    return existing!.workflowStatus;
  }
  return incoming;
}

export function isPaperworkStatusRegression(
  incoming: PaperworkStatus,
  existing: PaperworkStatus | undefined,
): boolean {
  if (!existing) return false;
  if (!ADVANCED_PAPERWORK_STATUSES.has(existing)) return false;
  return PAPERWORK_STATUS_RANK[incoming] < PAPERWORK_STATUS_RANK[existing];
}

export function resolvePaperworkStatus(
  incoming: PaperworkStatus | undefined,
  existing: PaperworkStatus | undefined,
  force = false,
): PaperworkStatus {
  const fallback = existing ?? "not_sent";
  if (incoming === undefined) return fallback;
  if (force) return incoming;
  if (isPaperworkStatusRegression(incoming, existing)) return existing!;
  return incoming;
}

export function hasAdvancedPaperworkState(
  record: Pick<CandidateWorkflowRecord, "paperworkStatus" | "workflowStatus" | "signatureRequestId"> | undefined,
): boolean {
  if (!record) return false;
  if (ADVANCED_PAPERWORK_STATUSES.has(record.paperworkStatus)) return true;
  if (ADVANCED_WORKFLOW_STATUSES.has(record.workflowStatus)) return true;
  return Boolean(record.signatureRequestId?.trim());
}

export function paperworkStatusFromOnboarding(status: OnboardingPacketStatus): PaperworkStatus | null {
  switch (status) {
    case "sent":
      return "sent";
    case "viewed":
    case "partially_completed":
      return "viewed";
    case "completed":
    case "ready_for_mel":
      return "signed";
    default:
      return null;
  }
}

export function workflowStatusFromOnboarding(status: OnboardingPacketStatus): CandidateWorkflowStatus | null {
  switch (status) {
    case "sent":
    case "viewed":
    case "partially_completed":
      return "Paperwork Sent";
    case "completed":
    case "ready_for_mel":
      return "Signed";
    default:
      return null;
  }
}

export function onboardingStatusRank(status: OnboardingPacketStatus): number {
  return ONBOARDING_STATUS_RANK[status] ?? 0;
}

export function workflowPaperworkRank(
  record: Pick<CandidateWorkflowRecord, "paperworkStatus" | "workflowStatus">,
): number {
  let rank = PAPERWORK_STATUS_RANK[record.paperworkStatus] ?? 0;
  if (ADVANCED_WORKFLOW_STATUSES.has(record.workflowStatus)) {
    rank = Math.max(rank, record.workflowStatus === "Signed" ? 4 : 2);
  }
  return rank;
}

export function isOnboardingAheadOfWorkflow(
  onboardingStatus: OnboardingPacketStatus,
  workflow: Pick<CandidateWorkflowRecord, "paperworkStatus" | "workflowStatus" | "signatureRequestId">,
): boolean {
  const targetPaperwork = paperworkStatusFromOnboarding(onboardingStatus);
  if (!targetPaperwork) return false;

  const onboardingRank = onboardingStatusRank(onboardingStatus);
  const workflowRank = workflowPaperworkRank(workflow);
  if (onboardingRank > workflowRank) return true;

  if (
    onboardingStatus === "sent" &&
    workflow.paperworkStatus === "not_sent" &&
    workflow.workflowStatus !== "Paperwork Sent"
  ) {
    return true;
  }

  return false;
}
