import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildQueueCandidateRow,
  isUnassignedRecruiter,
  matchesQueueLane,
} from "@/lib/candidate-action-queue";
import { isFollowUpOverdue, isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { RecruiterWorkloadRow } from "@/lib/territory-action-engine/types";

const WORKLOAD_LIMIT = 16;

function overloadLevel(score: number): RecruiterWorkloadRow["overloadLevel"] {
  if (score >= 80) return "overloaded";
  if (score >= 55) return "elevated";
  return "balanced";
}

function redistributionHint(row: RecruiterWorkloadRow): string {
  if (row.overloadLevel === "overloaded") {
    return `Shift ${Math.ceil(row.assignedCount * 0.15)} candidates and ${row.followUpsDue} follow-ups to balanced recruiters`;
  }
  if (row.overloadLevel === "elevated") {
    return "Pair with a backup recruiter for paperwork and MEL-ready handoffs";
  }
  return "Capacity available for unassigned intake";
}

export function buildRecruiterWorkloadRows(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
}): RecruiterWorkloadRow[] {
  const byRecruiter = new Map<
    string,
    { assigned: number; followUps: number; paperwork: number; mel: number }
  >();

  for (const candidate of input.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    const scored = buildScoredWorkflowRow(candidate, workflow);
    const recruiter = scored.assignedRecruiter.trim() || "Unassigned";
    if (isUnassignedRecruiter(recruiter)) continue;

    const bucket = byRecruiter.get(recruiter) ?? {
      assigned: 0,
      followUps: 0,
      paperwork: 0,
      mel: 0,
    };
    bucket.assigned += 1;

    const queueRow = buildQueueCandidateRow(scored);
    if (
      matchesQueueLane(queueRow, "follow-up-due", recruiter) ||
      isFollowUpOverdue({
        recruitingActions: scored.recruitingActions,
        followUpDueAt: scored.followUpDueAt,
      })
    ) {
      bucket.followUps += 1;
    }
    if (isPaperworkPendingStatus(scored.workflowStatus)) bucket.paperwork += 1;
    if (isMelReadyStatus(scored.workflowStatus)) bucket.mel += 1;

    byRecruiter.set(recruiter, bucket);
  }

  const rows: RecruiterWorkloadRow[] = [];
  for (const [recruiterName, stats] of byRecruiter.entries()) {
    const workloadScore = Math.min(
      100,
      Math.round(
        stats.assigned * 1.2 +
          stats.followUps * 6 +
          stats.paperwork * 4 +
          stats.mel * 5,
      ),
    );
    const row: RecruiterWorkloadRow = {
      recruiterName,
      assignedCount: stats.assigned,
      followUpsDue: stats.followUps,
      paperworkPending: stats.paperwork,
      readyForMel: stats.mel,
      workloadScore,
      overloadLevel: overloadLevel(workloadScore),
      recommendedRedistribution: "",
    };
    row.recommendedRedistribution = redistributionHint(row);
    rows.push(row);
  }

  return rows
    .sort((a, b) => b.workloadScore - a.workloadScore)
    .slice(0, WORKLOAD_LIMIT);
}

export function isRecruiterOverloaded(row: RecruiterWorkloadRow): boolean {
  return row.overloadLevel !== "balanced";
}
