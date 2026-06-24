import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
]);

const INTAKE_STATUSES = new Set<CandidateWorkflowStatus>(["Applied", "Needs Review"]);

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

export function canPromoteToPaperworkFunnel(
  row: ScoredCandidateWorkflowRow,
  policy: CandidateOnboardingPolicy,
): boolean {
  if (!policy.funnelPromotion.enabled) return false;
  if (isUnassignedRecruiter(row.assignedRecruiter)) return false;
  if (!row.email?.trim()) return false;
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return false;
  if (hasActivePacket(row)) return false;
  if (row.paperworkStatus === "signed") return false;
  if (!isGradeAllowedForPaperwork(row.aiGrade, policy.paperworkByGrade)) return false;
  if (!INTAKE_STATUSES.has(row.workflowStatus)) return false;
  const actionType = row.actionType ?? "none";
  if (actionType === "send-paperwork" || actionType === "await-signature") return false;
  return true;
}

export function applyPaperworkFunnelPromotionToRow(
  row: ScoredCandidateWorkflowRow,
): ScoredCandidateWorkflowRow {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return {
    ...row,
    workflowStatus: "Paperwork Needed",
    requiredAction: "Send Paperwork",
    actionType: "send-paperwork",
    actionPriority: "high",
    actionReason: `P65.6 grade ${row.aiGrade} — policy-approved paperwork funnel promotion.`,
    actionDueDate: today,
    actionConfidence: row.actionConfidence ?? 80,
    actionGeneratedAt: row.actionGeneratedAt ?? now,
  };
}

export async function promotePaperworkFunnel(input: {
  candidates: ScoredCandidateWorkflowRow[];
  policy: CandidateOnboardingPolicy;
  orchestratorRunId?: string;
  byUserId?: string;
  dryRun?: boolean;
}): Promise<{ promoted: number; promotable: number }> {
  const dryRun = input.dryRun ?? input.policy.dryRun;
  let promoted = 0;
  let promotable = 0;

  for (const row of input.candidates) {
    if (!canPromoteToPaperworkFunnel(row, input.policy)) continue;
    promotable += 1;
    if (dryRun) continue;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    await upsertCandidateWorkflow({
      candidateId: row.candidateId,
      workflowStatus: "Paperwork Needed",
      requiredAction: "Send Paperwork",
      actionType: "send-paperwork",
      actionPriority: "high",
      actionReason: `P65.6 grade ${row.aiGrade} — policy-approved paperwork funnel promotion.`,
      actionDueDate: today,
      actionConfidence: row.actionConfidence ?? 80,
      actionGeneratedAt: row.actionGeneratedAt ?? now,
      note: "P65.6 onboarding funnel promotion — prepared for paperwork (not sent).",
      audit: {
        action: "onboarding_paperwork_funnel_promotion",
        byUserId: input.byUserId,
        metadata: {
          grade: row.aiGrade,
          previousWorkflowStatus: row.workflowStatus,
          previousActionType: row.actionType ?? "none",
        },
      },
    });
    promoted += 1;
  }

  return { promoted, promotable };
}

export function countPromotablePaperworkFunnel(
  candidates: ScoredCandidateWorkflowRow[],
  policy: CandidateOnboardingPolicy,
): number {
  return candidates.filter((row) => canPromoteToPaperworkFunnel(row, policy)).length;
}
