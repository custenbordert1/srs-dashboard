import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  calendarDaysSince,
  isFollowUpOverdue,
} from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateRecoveryItem } from "@/lib/ai-action-engine/types";

export function buildCandidateRecoveryList(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  fetchedAt: string;
  limit?: number;
}): CandidateRecoveryItem[] {
  if (!input.workflows) return [];

  const referenceMs = Date.parse(input.fetchedAt) || Date.now();
  const rows: CandidateRecoveryItem[] = [];

  for (const candidate of input.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    if (!workflow) continue;
    const row = buildBaselineWorkflowRow(candidate, workflow);
    const name = `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email;
    const days = calendarDaysSince(candidate.appliedDate, referenceMs) ?? 0;
    const overdue = isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    });

    if (overdue) {
      rows.push({
        candidateId: candidate.candidateId,
        name,
        city: candidate.city,
        state: candidate.state,
        recoveryType: "stalled",
        reason: "Follow-up overdue on active workflow",
        recommendedAction: "send-follow-up",
        priorityScore: 90,
      });
      continue;
    }

    if (days >= 14 && row.workflowStatus === "Applied") {
      rows.push({
        candidateId: candidate.candidateId,
        name,
        city: candidate.city,
        state: candidate.state,
        recoveryType: "inactive",
        reason: `No progression in ${days} days`,
        recommendedAction: "send-follow-up",
        priorityScore: 75,
      });
      continue;
    }

    if (days <= 3 && isUnassignedRecruiter(row.assignedRecruiter ?? "")) {
      rows.push({
        candidateId: candidate.candidateId,
        name,
        city: candidate.city,
        state: candidate.state,
        recoveryType: "uncontacted",
        reason: "Fresh applicant with no recruiter assigned",
        recommendedAction: "assign-recruiter",
        priorityScore: 80,
      });
    }
  }

  return rows.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, input.limit ?? 20);
}
