import type { CandidateRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export const SLA_APPLIED_AGING_DAYS = 3;
export const SLA_FOLLOW_UP_HOURS = 48;
export const SLA_PAPERWORK_AGING_DAYS = 5;
export const SLA_RECRUITER_INACTIVITY_DAYS = 7;
export const SLA_SNOOZE_HOURS = 24;

export type SlaSeverity = "none" | "warn" | "critical";

export type CandidateSlaSnapshot = {
  appliedDays: number | null;
  statusDays: number | null;
  followUpHoursSinceFlag: number | null;
  followUpDueInHours: number | null;
  appliedAgingSeverity: SlaSeverity;
  followUpOverdue: boolean;
  followUpDueSeverity: SlaSeverity;
  paperworkAgingSeverity: SlaSeverity;
  recruiterInactivitySeverity: SlaSeverity;
  isSnoozed: boolean;
};

const PAPERWORK_STATUSES: CandidateWorkflowStatus[] = [
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
];

const READY_MEL_STATUSES: CandidateWorkflowStatus[] = ["Signed", "Ready for MEL"];

export function calendarDaysSince(raw: string | null, referenceMs = Date.now()): number | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const ref = new Date(referenceMs);
  const end = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

export function hoursSince(raw: string | null, referenceMs = Date.now()): number | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((referenceMs - date.getTime()) / (60 * 60 * 1000)));
}

export function hoursUntil(raw: string | null, referenceMs = Date.now()): number | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((date.getTime() - referenceMs) / (60 * 60 * 1000));
}

export function isSnoozedUntil(snoozedUntil: string | null, referenceMs = Date.now()): boolean {
  if (!snoozedUntil) return false;
  const until = new Date(snoozedUntil).getTime();
  return !Number.isNaN(until) && until > referenceMs;
}

function severityForAppliedDays(days: number | null): SlaSeverity {
  if (days === null) return "none";
  if (days >= SLA_APPLIED_AGING_DAYS + 4) return "critical";
  if (days >= SLA_APPLIED_AGING_DAYS) return "warn";
  return "none";
}

function severityForInactiveDays(days: number | null): SlaSeverity {
  if (days === null) return "none";
  if (days >= SLA_RECRUITER_INACTIVITY_DAYS + 3) return "critical";
  if (days >= SLA_RECRUITER_INACTIVITY_DAYS) return "warn";
  return "none";
}

function severityForPaperworkDays(days: number | null): SlaSeverity {
  if (days === null) return "none";
  if (days >= SLA_PAPERWORK_AGING_DAYS + 3) return "critical";
  if (days >= SLA_PAPERWORK_AGING_DAYS) return "warn";
  return "none";
}

function severityForFollowUpDue(hoursUntilDue: number | null, overdue: boolean): SlaSeverity {
  if (overdue) return "critical";
  if (hoursUntilDue !== null && hoursUntilDue <= 12) return "warn";
  return "none";
}

export function isFollowUpOverdue(input: {
  recruitingActions: CandidateRecruitingActions;
  followUpDueAt?: string | null;
  referenceMs?: number;
}): boolean {
  const referenceMs = input.referenceMs ?? Date.now();
  if (input.followUpDueAt) {
    const due = new Date(input.followUpDueAt).getTime();
    if (!Number.isNaN(due) && due <= referenceMs) return true;
  }
  if (!input.recruitingActions.needsFollowUp) return false;
  const hours = hoursSince(input.recruitingActions.updatedAt, referenceMs);
  return hours !== null && hours >= SLA_FOLLOW_UP_HOURS;
}

export function isMelReadyStatus(status: CandidateWorkflowStatus): boolean {
  return READY_MEL_STATUSES.includes(status);
}

export function isPaperworkPendingStatus(status: CandidateWorkflowStatus): boolean {
  return PAPERWORK_STATUSES.includes(status);
}

export function slaToneClass(severity: SlaSeverity): string {
  if (severity === "critical") return "border-red-500/40 bg-red-500/10 text-red-100";
  if (severity === "warn") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-zinc-700/80 bg-zinc-900/40 text-zinc-400";
}

export function buildCandidateSlaSnapshot(input: {
  appliedDate: string;
  workflowStatus: CandidateWorkflowStatus;
  lastActionAt: string | null;
  recruitingActions: CandidateRecruitingActions;
  followUpDueAt?: string | null;
  snoozedUntil?: string | null;
  referenceMs?: number;
}): CandidateSlaSnapshot {
  const referenceMs = input.referenceMs ?? Date.now();
  const appliedDays = calendarDaysSince(input.appliedDate, referenceMs);
  const statusDays = calendarDaysSince(input.lastActionAt ?? input.appliedDate, referenceMs);
  const followUpHoursSinceFlag = input.recruitingActions.needsFollowUp
    ? hoursSince(input.recruitingActions.updatedAt, referenceMs)
    : null;
  const followUpDueInHours = input.followUpDueAt ? hoursUntil(input.followUpDueAt, referenceMs) : null;
  const followUpOverdue = isFollowUpOverdue({
    recruitingActions: input.recruitingActions,
    followUpDueAt: input.followUpDueAt,
    referenceMs,
  });
  const paperworkAgingSeverity = isPaperworkPendingStatus(input.workflowStatus)
    ? severityForPaperworkDays(statusDays)
    : "none";

  return {
    appliedDays,
    statusDays,
    followUpHoursSinceFlag,
    followUpDueInHours,
    appliedAgingSeverity: severityForAppliedDays(appliedDays),
    followUpOverdue,
    followUpDueSeverity: severityForFollowUpDue(followUpDueInHours, followUpOverdue),
    paperworkAgingSeverity,
    recruiterInactivitySeverity:
      input.workflowStatus === "Not Qualified" || input.workflowStatus === "Active Rep"
        ? "none"
        : severityForInactiveDays(statusDays),
    isSnoozed: isSnoozedUntil(input.snoozedUntil ?? null, referenceMs),
  };
}
