import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildCandidateSlaSnapshot, isMelReadyStatus } from "@/lib/candidate-action-sla";
import { isHiredStage } from "@/lib/dm-dashboard/territory-shared";
import type {
  ProductivityPeriodKpis,
  RecruiterProductivityDashboard,
  RecruiterScoreLevel,
  RecruiterScorecard,
} from "@/lib/recruiter-action-center/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function withinMs(iso: string | null, referenceMs: number, windowMs: number): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return referenceMs - ts <= windowMs && referenceMs >= ts;
}

function countWorked(rows: ScoredCandidateWorkflowRow[], referenceMs: number, days: number): number {
  const windowMs = days * MS_PER_DAY;
  return rows.filter((row) => withinMs(row.lastActionAt, referenceMs, windowMs)).length;
}

function countFollowUpsCompleted(rows: ScoredCandidateWorkflowRow[], referenceMs: number, days: number): number {
  const windowMs = days * MS_PER_DAY;
  return rows.filter(
    (row) =>
      withinMs(row.lastActionAt, referenceMs, windowMs) &&
      !row.recruitingActions.needsFollowUp &&
      Boolean(row.followUpDueAt || row.history.some((entry) => entry.type === "follow_up" || entry.message.toLowerCase().includes("follow"))),
  ).length;
}

function countPaperworkSent(rows: ScoredCandidateWorkflowRow[], referenceMs: number, days: number): number {
  const windowMs = days * MS_PER_DAY;
  return rows.filter(
    (row) =>
      withinMs(row.paperworkSentAt ?? row.lastActionAt, referenceMs, windowMs) &&
      ["Paperwork Sent", "Signed", "Ready for MEL", "Active Rep"].includes(row.workflowStatus),
  ).length;
}

function countReadyForMel(rows: ScoredCandidateWorkflowRow[], referenceMs: number, days: number): number {
  const windowMs = days * MS_PER_DAY;
  return rows.filter(
    (row) =>
      isMelReadyStatus(row.workflowStatus) && withinMs(row.lastActionAt, referenceMs, windowMs),
  ).length;
}

function countPlacements(rows: ScoredCandidateWorkflowRow[], referenceMs: number, days: number): number {
  const windowMs = days * MS_PER_DAY;
  return rows.filter(
    (row) =>
      (withinMs(row.paperworkSignedAt, referenceMs, windowMs) ||
        withinMs(row.lastActionAt, referenceMs, windowMs)) &&
      (isHiredStage(row.stage) || row.workflowStatus === "Active Rep"),
  ).length;
}

function buildPeriod(rows: ScoredCandidateWorkflowRow[], referenceMs: number, days: number): ProductivityPeriodKpis {
  return {
    candidatesWorked: countWorked(rows, referenceMs, days),
    followUpsCompleted: countFollowUpsCompleted(rows, referenceMs, days),
    paperworkSent: countPaperworkSent(rows, referenceMs, days),
    readyForMel: countReadyForMel(rows, referenceMs, days),
    placementsInfluenced: countPlacements(rows, referenceMs, days),
  };
}

export function buildProductivityDashboard(input: {
  rows: ScoredCandidateWorkflowRow[];
  referenceMs: number;
}): RecruiterProductivityDashboard {
  const { rows, referenceMs } = input;
  return {
    today: buildPeriod(rows, referenceMs, 1),
    week: buildPeriod(rows, referenceMs, 7),
    month: buildPeriod(rows, referenceMs, 30),
  };
}

export function resolveRecruiterScoreLevel(score: number): RecruiterScoreLevel {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "needs-attention";
  return "at-risk";
}

export function recruiterScoreLevelLabel(level: RecruiterScoreLevel): string {
  switch (level) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "needs-attention":
      return "Needs Attention";
    case "at-risk":
      return "At Risk";
  }
}

export function buildRecruiterScorecard(input: {
  rows: ScoredCandidateWorkflowRow[];
  productivity: RecruiterProductivityDashboard;
  referenceMs: number;
}): RecruiterScorecard {
  const { rows, productivity, referenceMs } = input;
  const assigned = rows.length;
  const overdue = rows.filter((row) =>
    buildCandidateSlaSnapshot({
      appliedDate: row.appliedDate,
      workflowStatus: row.workflowStatus,
      lastActionAt: row.lastActionAt,
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      snoozedUntil: row.snoozedUntil,
      referenceMs,
    }).followUpOverdue,
  ).length;
  const paperworkAging = rows.filter(
    (row) =>
      buildCandidateSlaSnapshot({
        appliedDate: row.appliedDate,
        workflowStatus: row.workflowStatus,
        lastActionAt: row.lastActionAt,
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        snoozedUntil: row.snoozedUntil,
        referenceMs,
      }).paperworkAgingSeverity === "critical",
  ).length;

  const workRate = assigned > 0 ? productivity.today.candidatesWorked / Math.max(assigned * 0.2, 1) : 0;
  const followUpRate =
    productivity.week.followUpsCompleted / Math.max(productivity.week.candidatesWorked, 1);
  const paperworkRate =
    productivity.week.paperworkSent / Math.max(rows.filter((r) => r.workflowStatus === "Qualified").length, 1);
  const melRate = productivity.week.readyForMel / Math.max(productivity.week.paperworkSent, 1);
  const placementRate = productivity.month.placementsInfluenced / Math.max(productivity.month.candidatesWorked, 1);

  const score = Math.round(
    Math.min(
      100,
      workRate * 25 +
        followUpRate * 20 +
        paperworkRate * 20 +
        melRate * 20 +
        placementRate * 15 -
        overdue * 2 -
        paperworkAging,
    ),
  );

  const level = resolveRecruiterScoreLevel(score);
  const drivers: string[] = [];
  if (productivity.today.candidatesWorked > 0) drivers.push(`${productivity.today.candidatesWorked} worked today`);
  if (followUpRate >= 0.5) drivers.push("Strong follow-up completion");
  if (paperworkRate >= 0.4) drivers.push("Healthy paperwork turnaround");
  if (melRate >= 0.3) drivers.push("Ready-for-MEL movement on track");
  if (overdue > 0) drivers.push(`${overdue} overdue follow-ups`);
  if (paperworkAging > 0) drivers.push(`${paperworkAging} paperwork aging critical`);

  return {
    level,
    score,
    label: recruiterScoreLevelLabel(level),
    drivers: drivers.slice(0, 4),
  };
}
