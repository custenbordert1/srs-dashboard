import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildCandidateSlaSnapshot, isFollowUpOverdue, isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  buildProductivityDashboard,
  resolveRecruiterScoreLevel,
} from "@/lib/recruiter-action-center/productivity";
import type { TeamLeaderRecruiterView } from "@/lib/recruiter-action-center/types";

function isSameCalendarDay(iso: string | null, referenceMs: number): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const ref = new Date(referenceMs);
  return (
    date.getUTCFullYear() === ref.getUTCFullYear() &&
    date.getUTCMonth() === ref.getUTCMonth() &&
    date.getUTCDate() === ref.getUTCDate()
  );
}

function recruiterProductivityScore(rows: ScoredCandidateWorkflowRow[], referenceMs: number): number {
  const productivity = buildProductivityDashboard({ rows, referenceMs });
  const assigned = rows.length;
  const overdue = rows.filter((row) =>
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    }),
  ).length;
  const workedToday = productivity.today.candidatesWorked;
  const score = Math.round(
    Math.min(
      100,
      (workedToday / Math.max(assigned * 0.15, 1)) * 40 +
        (productivity.week.followUpsCompleted / Math.max(assigned * 0.25, 1)) * 30 +
        (productivity.week.readyForMel / Math.max(assigned * 0.1, 1)) * 30 -
        overdue * 3,
    ),
  );
  return Math.max(0, score);
}

export function buildTeamLeaderView(input: {
  rows: ScoredCandidateWorkflowRow[];
  recruiters: string[];
  referenceMs: number;
}): TeamLeaderRecruiterView[] {
  const { rows, recruiters, referenceMs } = input;
  const names = [...new Set([...recruiters, ...rows.map((row) => row.assignedRecruiter)])].filter(
    (name) => !isUnassignedRecruiter(name),
  );

  const views = names.map((recruiterName) => {
    const owned = rows.filter((row) => row.assignedRecruiter.trim() === recruiterName.trim());
    const workedToday = owned.filter((row) => isSameCalendarDay(row.lastActionAt, referenceMs)).length;
    const openFollowUps = owned.filter(
      (row) => row.recruitingActions.needsFollowUp || Boolean(row.followUpDueAt),
    ).length;
    const overdueFollowUps = owned.filter((row) =>
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      }),
    ).length;
    const paperworkAging = owned.filter((row) => {
      const sla = buildCandidateSlaSnapshot({
        appliedDate: row.appliedDate,
        workflowStatus: row.workflowStatus,
        lastActionAt: row.lastActionAt,
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        snoozedUntil: row.snoozedUntil,
        referenceMs,
      });
      return (
        (isPaperworkPendingStatus(row.workflowStatus) || row.workflowStatus === "Paperwork Sent") &&
        sla.paperworkAgingSeverity !== "none"
      );
    }).length;
    const readyForMelBacklog = owned.filter((row) => isMelReadyStatus(row.workflowStatus)).length;
    const productivityScore = recruiterProductivityScore(owned, referenceMs);
    const productivityLevel = resolveRecruiterScoreLevel(productivityScore);

    return {
      recruiterName,
      assigned: owned.length,
      workedToday,
      openFollowUps,
      overdueFollowUps,
      paperworkAging,
      readyForMelBacklog,
      productivityScore,
      productivityLevel,
      highlight: null as TeamLeaderRecruiterView["highlight"],
    };
  });

  const sorted = [...views].sort((a, b) => b.productivityScore - a.productivityScore);
  if (sorted[0] && sorted[0].productivityScore >= 75) sorted[0].highlight = "top-performer";

  for (const row of sorted) {
    if (row.overdueFollowUps >= 3 || row.paperworkAging >= 2) {
      row.highlight = row.highlight ?? "needs-support";
    }
    if (row.assigned >= 5 && row.workedToday === 0) {
      row.highlight = row.highlight ?? "stalled-queue";
    }
  }

  return sorted;
}

export function rankTeamLeaderRows(rows: TeamLeaderRecruiterView[]): TeamLeaderRecruiterView[] {
  return [...rows].sort((a, b) => b.productivityScore - a.productivityScore);
}
