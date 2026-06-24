import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { hoursSince } from "@/lib/candidate-action-sla";
import type { CandidateOnboardingDecision, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL", "Ready for MEL"]);

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

export function isEligibleForSend(
  row: ScoredCandidateWorkflowRow,
  policy: CandidateOnboardingPolicy = DEFAULT_CANDIDATE_ONBOARDING_POLICY,
): boolean {
  if (isUnassignedRecruiter(row.assignedRecruiter)) return false;
  if (!row.actionGeneratedAt) return false;
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return false;
  if (hasActivePacket(row)) return false;
  if (row.paperworkStatus === "signed") return false;
  if (!row.email?.trim()) return false;
  if (!isGradeAllowedForPaperwork(row.aiGrade, policy.paperworkByGrade)) return false;
  const actionType = row.actionType ?? "none";
  return actionType === "send-paperwork" || actionType === "await-signature";
}

export function buildOnboardingDecisions(input: {
  candidates: ScoredCandidateWorkflowRow[];
  reminderHours: number[];
  escalationOverdueHours: number;
  existingEscalations: Set<string>;
  policy?: CandidateOnboardingPolicy;
}): CandidateOnboardingDecision[] {
  const policy = input.policy ?? DEFAULT_CANDIDATE_ONBOARDING_POLICY;
  const decisions: CandidateOnboardingDecision[] = [];

  for (const row of input.candidates) {
    if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
      if (!isMelReady(row)) {
        decisions.push({
          candidateId: row.candidateId,
          decisionType: "mark-ready-for-mel",
          reason: "Paperwork signed — prepare for MEL handoff",
        });
      }
      continue;
    }

    if (hasActivePacket(row) && row.signatureRequestId) {
      decisions.push({
        candidateId: row.candidateId,
        decisionType: "sync-status",
        reason: "Active packet — sync Dropbox Sign status",
        signatureRequestId: row.signatureRequestId,
      });

      const sentHours = hoursSince(row.paperworkSentAt);
      if (sentHours != null) {
        const reminderStage = input.reminderHours.findIndex((hours) => sentHours >= hours);
        if (reminderStage >= 0) {
          decisions.push({
            candidateId: row.candidateId,
            decisionType: "reminder",
            reason: `Packet incomplete after ${input.reminderHours[reminderStage]}h`,
            signatureRequestId: row.signatureRequestId,
          });
        }
        if (
          sentHours >= input.escalationOverdueHours &&
          !input.existingEscalations.has(row.candidateId)
        ) {
          decisions.push({
            candidateId: row.candidateId,
            decisionType: "escalate",
            reason: `Packet overdue beyond ${input.escalationOverdueHours}h`,
            signatureRequestId: row.signatureRequestId,
          });
        }
      }
      continue;
    }

    if (isEligibleForSend(row, policy)) {
      decisions.push({
        candidateId: row.candidateId,
        decisionType: "send-packet",
        reason: row.requiredAction ?? "Send onboarding paperwork",
      });
    }
  }

  return decisions;
}

function isMelReady(row: ScoredCandidateWorkflowRow): boolean {
  return row.workflowStatus === "Ready for MEL" || row.workflowStatus === "Loaded in MEL";
}

export function countEligibleForPaperwork(
  candidates: ScoredCandidateWorkflowRow[],
  policy: CandidateOnboardingPolicy = DEFAULT_CANDIDATE_ONBOARDING_POLICY,
): number {
  return candidates.filter((row) => isEligibleForSend(row, policy)).length;
}
