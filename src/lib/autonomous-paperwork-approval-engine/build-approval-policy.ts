import type { ApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/types";

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  readonly: true,
  autoApproveThreshold: 90,
  humanApprovalThreshold: 70,
  waitingThreshold: 50,
  requirePublishedJob: true,
  requireValidEmail: true,
  requireNoDuplicateRisk: true,
  requireNoAlreadySent: true,
  requireTemplate: true,
  requireApprovedMappingOrNativeProject: true,
};

export function buildApprovalPolicy(): ApprovalPolicy {
  return { ...DEFAULT_APPROVAL_POLICY };
}
