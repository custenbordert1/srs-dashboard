import {
  CANDIDATE_WORKFLOW_STATUSES,
  type CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";
import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace";
import type { CandidateOpsWorkflowStage } from "@/lib/p259-candidate-operations/types";

/** Operator-facing stage rail: Applied → … → Ready for MEL, plus Archived marker. */
export const CANDIDATE_OPS_STAGE_RAIL: Array<CandidateWorkflowStatus | "Archived"> = [
  "Applied",
  "Needs Review",
  "Qualified",
  "Operator Approved",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Archived",
];

export function buildWorkflowStages(
  row: HiringWorkspaceApplicantRow,
): CandidateOpsWorkflowStage[] {
  const archived =
    /archiv/i.test(row.breezyStage) || /archiv/i.test(row.workflowStatus);

  return CANDIDATE_OPS_STAGE_RAIL.map((id) => ({
    id,
    label: id,
    current:
      id === "Archived"
        ? archived
        : !archived && row.workflowStatus === id,
  }));
}

export function listMovableStages(): CandidateWorkflowStatus[] {
  return [...CANDIDATE_WORKFLOW_STATUSES];
}

export function buildTelLink(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

export function buildSmsLink(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `sms:+${digits.length === 10 ? `1${digits}` : digits}`;
}
