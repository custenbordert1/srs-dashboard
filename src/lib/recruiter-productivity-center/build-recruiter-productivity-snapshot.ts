import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { isHiredStage, parseDate } from "@/lib/dm-dashboard/territory-shared";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type {
  RecruiterAgingBucket,
  RecruiterAgingBucketId,
  RecruiterDailyTask,
  RecruiterDailyTaskType,
  RecruiterDashboardKpis,
  RecruiterProductivityFilters,
  RecruiterProductivitySnapshot,
  RecruiterScorecardRow,
} from "@/lib/recruiter-productivity-center/recruiter-productivity-types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

export function computeRecruiterAgingBucket(
  appliedDate: string | null,
  referenceMs: number,
): RecruiterAgingBucketId | null {
  const days = calendarDaysSince(appliedDate, referenceMs);
  if (days === null) return null;
  if (days <= 2) return "0-2";
  if (days <= 7) return "3-7";
  if (days <= 14) return "8-14";
  return "15+";
}

const AGING_BUCKET_LABELS: Record<RecruiterAgingBucketId, string> = {
  "0-2": "0–2 days",
  "3-7": "3–7 days",
  "8-14": "8–14 days",
  "15+": "15+ days",
};

function candidateDisplayName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || row.candidateId;
}

function matchesRecruiter(row: ScoredCandidateWorkflowRow, actingRecruiter?: string | null): boolean {
  if (!actingRecruiter?.trim()) return true;
  const recruiter = row.assignedRecruiter?.trim() || "Unassigned";
  return recruiter === actingRecruiter.trim();
}

function matchesTerritory(row: ScoredCandidateWorkflowRow, territoryStates?: string[] | null): boolean {
  if (!territoryStates || territoryStates.length === 0) return true;
  const allowed = new Set(territoryStates.map(normalizeStateCode));
  const state = normalizeStateCode(row.state);
  return state.length === 2 && allowed.has(state);
}

function buildScopedRows(
  candidates: BreezyCandidate[],
  workflows: CandidateWorkflowState,
  filters: RecruiterProductivityFilters,
): ScoredCandidateWorkflowRow[] {
  return candidates
    .map((candidate) => buildBaselineWorkflowRow(candidate, workflows[candidate.candidateId]))
    .filter((row) => matchesTerritory(row, filters.territoryStates))
    .filter((row) => matchesRecruiter(row, filters.actingRecruiter));
}

function isNewApplicantToday(appliedDate: string | null, referenceMs: number): boolean {
  if (!appliedDate) return false;
  const applied = parseDate(appliedDate);
  if (!applied) return false;
  const ref = new Date(referenceMs);
  return (
    applied.getUTCFullYear() === ref.getUTCFullYear() &&
    applied.getUTCMonth() === ref.getUTCMonth() &&
    applied.getUTCDate() === ref.getUTCDate()
  );
}

function isHiredThisWeek(candidate: ScoredCandidateWorkflowRow, referenceMs: number): boolean {
  if (candidate.workflowStatus === "Active Rep" || isHiredStage(candidate.stage)) {
    const anchor = candidate.paperworkSignedAt ?? candidate.lastActionAt ?? candidate.appliedDate;
    const date = parseDate(anchor);
    if (!date) return false;
    return referenceMs - date.getTime() <= MS_PER_WEEK;
  }
  return false;
}

function hasBeenContacted(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(row.lastActionAt) || row.history.length > 0;
}

function paperworkSentOrBeyond(row: ScoredCandidateWorkflowRow): boolean {
  return (
    row.workflowStatus === "Paperwork Sent" ||
    row.workflowStatus === "Signed" ||
    row.workflowStatus === "Ready for MEL" ||
    row.workflowStatus === "Active Rep" ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed"
  );
}

function isHiredRow(row: ScoredCandidateWorkflowRow): boolean {
  return row.workflowStatus === "Active Rep" || isHiredStage(row.stage);
}

function firstContactHours(row: ScoredCandidateWorkflowRow): number | null {
  const firstHistory = row.history[row.history.length - 1]?.createdAt ?? row.lastActionAt;
  if (!firstHistory) return null;
  return hoursSince(row.appliedDate, Date.parse(firstHistory));
}

function daysToHire(row: ScoredCandidateWorkflowRow): number | null {
  if (!isHiredRow(row)) return null;
  const endIso = row.paperworkSignedAt ?? row.lastActionAt;
  if (!endIso) return null;
  const applied = parseDate(row.appliedDate);
  const end = parseDate(endIso);
  if (!applied || !end) return null;
  const startDay = Date.UTC(applied.getUTCFullYear(), applied.getUTCMonth(), applied.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(0, Math.round((endDay - startDay) / MS_PER_DAY));
}

function buildDashboardKpis(rows: ScoredCandidateWorkflowRow[], referenceMs: number): RecruiterDashboardKpis {
  let newApplicantsToday = 0;
  let followUpsDue = 0;
  let paperworkPending = 0;
  let readyForMel = 0;
  let hiredThisWeek = 0;

  for (const row of rows) {
    if (isNewApplicantToday(row.appliedDate, referenceMs)) newApplicantsToday += 1;
    if (
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      })
    ) {
      followUpsDue += 1;
    }
    if (isPaperworkPendingStatus(row.workflowStatus)) paperworkPending += 1;
    if (isMelReadyStatus(row.workflowStatus)) readyForMel += 1;
    if (isHiredThisWeek(row, referenceMs)) hiredThisWeek += 1;
  }

  return {
    applicantsAssigned: rows.length,
    newApplicantsToday,
    followUpsDue,
    paperworkPending,
    readyForMel,
    hiredThisWeek,
  };
}

function buildAgingBuckets(rows: ScoredCandidateWorkflowRow[], referenceMs: number): RecruiterAgingBucket[] {
  const counts: Record<RecruiterAgingBucketId, number> = {
    "0-2": 0,
    "3-7": 0,
    "8-14": 0,
    "15+": 0,
  };
  for (const row of rows) {
    const bucket = computeRecruiterAgingBucket(row.appliedDate, referenceMs);
    if (bucket) counts[bucket] += 1;
  }
  return (Object.keys(counts) as RecruiterAgingBucketId[]).map((id) => ({
    id,
    label: AGING_BUCKET_LABELS[id],
    count: counts[id],
  }));
}

function buildScorecards(rows: ScoredCandidateWorkflowRow[]): RecruiterScorecardRow[] {
  const byRecruiter = new Map<string, ScoredCandidateWorkflowRow[]>();
  for (const row of rows) {
    const recruiter = row.assignedRecruiter?.trim() || "Unassigned";
    const bucket = byRecruiter.get(recruiter) ?? [];
    bucket.push(row);
    byRecruiter.set(recruiter, bucket);
  }

  return [...byRecruiter.entries()]
    .map(([recruiter, scoped]) => {
      const contacted = scoped.filter(hasBeenContacted).length;
      const paperwork = scoped.filter(paperworkSentOrBeyond).length;
      const hired = scoped.filter(isHiredRow).length;
      const contactHours = scoped.map(firstContactHours).filter((v): v is number => v !== null);
      const hireDays = scoped.map(daysToHire).filter((v): v is number => v !== null);

      return {
        recruiter,
        assignedCount: scoped.length,
        contactRatePercent:
          scoped.length > 0 ? Math.round((contacted / scoped.length) * 100) : null,
        paperworkConversionPercent:
          contacted > 0 ? Math.round((paperwork / contacted) * 100) : null,
        hireConversionPercent:
          scoped.length > 0 ? Math.round((hired / scoped.length) * 100) : null,
        avgTimeToFirstContactHours:
          contactHours.length > 0
            ? Math.round((contactHours.reduce((sum, h) => sum + h, 0) / contactHours.length) * 10) / 10
            : null,
        avgDaysToHire:
          hireDays.length > 0
            ? Math.round((hireDays.reduce((sum, d) => sum + d, 0) / hireDays.length) * 10) / 10
            : null,
      };
    })
    .sort((a, b) => b.assignedCount - a.assignedCount || a.recruiter.localeCompare(b.recruiter));
}

const TASK_LABELS: Record<RecruiterDailyTaskType, string> = {
  "call-candidate": "Call candidate",
  "send-paperwork": "Send paperwork",
  "follow-up": "Follow up",
  "escalate-dm": "Escalate to DM",
};

function resolveDailyTaskType(row: ScoredCandidateWorkflowRow, referenceMs: number): RecruiterDailyTaskType | null {
  if (row.dmNeedsAssignment) return "escalate-dm";
  if (
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    }) ||
    row.recruitingActions.needsFollowUp
  ) {
    return "follow-up";
  }
  if (row.workflowStatus === "Qualified" || row.workflowStatus === "Paperwork Needed") {
    return "send-paperwork";
  }
  if (
    (row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review") &&
    !hasBeenContacted(row)
  ) {
    return "call-candidate";
  }
  return null;
}

function taskPriority(row: ScoredCandidateWorkflowRow, type: RecruiterDailyTaskType, referenceMs: number): number {
  const appliedDays = calendarDaysSince(row.appliedDate, referenceMs) ?? 0;
  const base = row.aiNumericScore ?? 0;
  const typeBoost =
    type === "follow-up"
      ? 40
      : type === "call-candidate"
        ? 30
        : type === "send-paperwork"
          ? 20
          : 10;
  return typeBoost + appliedDays * 2 + base / 10;
}

function buildDailyTasks(rows: ScoredCandidateWorkflowRow[], referenceMs: number): RecruiterDailyTask[] {
  const tasks: RecruiterDailyTask[] = [];
  for (const row of rows) {
    const type = resolveDailyTaskType(row, referenceMs);
    if (!type) continue;
    const appliedDays = calendarDaysSince(row.appliedDate, referenceMs);
    tasks.push({
      id: `${type}:${row.candidateId}`,
      type,
      label: TASK_LABELS[type],
      candidateId: row.candidateId,
      candidateName: candidateDisplayName(row),
      city: row.city,
      state: row.state,
      recruiter: row.assignedRecruiter?.trim() || "Unassigned",
      priorityScore: taskPriority(row, type, referenceMs),
      detail:
        appliedDays !== null
          ? `${row.workflowStatus} · ${appliedDays}d since applied`
          : row.workflowStatus,
    });
  }
  return tasks.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 40);
}

export function computeRecruiterProductivityScore(scorecards: RecruiterScorecardRow[]): number {
  if (scorecards.length === 0) return 0;
  const avg = (values: Array<number | null>) => {
    const nums = values.filter((v): v is number => v !== null);
    return nums.length > 0 ? nums.reduce((sum, v) => sum + v, 0) / nums.length : 0;
  };
  const contact = avg(scorecards.map((row) => row.contactRatePercent));
  const paperwork = avg(scorecards.map((row) => row.paperworkConversionPercent));
  const hire = avg(scorecards.map((row) => row.hireConversionPercent));
  return Math.min(100, Math.round(contact * 0.35 + paperwork * 0.35 + hire * 0.3));
}

export function buildRecruiterProductivitySnapshot(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  fetchedAt: string;
  filters?: RecruiterProductivityFilters;
}): RecruiterProductivitySnapshot {
  const filters: RecruiterProductivityFilters = {
    actingRecruiter: input.filters?.actingRecruiter ?? null,
    territoryStates: input.filters?.territoryStates ?? null,
  };
  const referenceMs = Date.parse(input.fetchedAt) || Date.now();
  const rows = buildScopedRows(input.candidates, input.workflows, filters);
  const scorecards = buildScorecards(rows);

  return {
    fetchedAt: input.fetchedAt,
    filters,
    dashboard: buildDashboardKpis(rows, referenceMs),
    scorecards,
    agingBuckets: buildAgingBuckets(rows, referenceMs),
    dailyTasks: buildDailyTasks(rows, referenceMs),
    productivityScore: computeRecruiterProductivityScore(scorecards),
  };
}

export function listRecruiterFilterOptions(
  candidates: BreezyCandidate[],
  workflows: CandidateWorkflowState,
  territoryStates?: string[] | null,
): string[] {
  const rows = buildScopedRows(candidates, workflows, { territoryStates });
  const recruiters = new Set<string>();
  for (const row of rows) {
    const recruiter = row.assignedRecruiter?.trim();
    if (recruiter && !isUnassignedRecruiter(recruiter)) recruiters.add(recruiter);
  }
  return [...recruiters].sort((a, b) => a.localeCompare(b));
}

export function listTerritoryStateOptions(candidates: BreezyCandidate[]): string[] {
  const states = new Set<string>();
  for (const candidate of candidates) {
    const state = normalizeStateCode(candidate.state);
    if (state.length === 2) states.add(state);
  }
  return [...states].sort((a, b) => a.localeCompare(b));
}
