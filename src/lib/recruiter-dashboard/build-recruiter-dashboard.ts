import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  calendarDaysSince,
  hoursSince,
  hoursUntil,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  computeRecruiterAgingBucket,
  isNewlyAppliedCandidate,
  matchesRecruiterQuickFilter,
  sortByRecruiterInboxPriority,
} from "@/lib/recruiter-action-queue-filters";
import { resolveWorkspaceAction } from "@/lib/candidate-workspace/resolve-workspace-action";
import { buildEnhancedHiringForecast } from "@/lib/hiring-funnel-automation/build-hiring-forecast";
import { buildRecruiterTasks } from "@/lib/hiring-funnel-automation/build-recruiter-tasks";
import {
  buildWorkloadBalanceRecommendations,
  summarizePipelineRisks,
} from "@/lib/hiring-funnel-automation/build-workload-balance";
import type {
  RecruiterDailyPlanAction,
  RecruiterDashboardSnapshot,
  RecruiterHiringForecast,
  RecruiterPipelineCard,
  RecruiterPipelineStageId,
  RecruiterProductivityByPeriod,
  RecruiterProductivityPeriod,
  RecruiterProductivitySnapshot,
  RecruiterScorecard,
  RecruiterTodayItem,
  RecruiterTodayItemId,
} from "@/lib/recruiter-dashboard/types";

const MS_DAY = 24 * 60 * 60 * 1000;

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function ownedBy(row: ScoredCandidateWorkflowRow, actingRecruiter: string): boolean {
  const recruiter = row.assignedRecruiter.trim();
  return recruiter.length > 0 && recruiter === actingRecruiter.trim();
}

function candidatesHref(candidateId?: string, queue?: string): string {
  const params = new URLSearchParams({ tab: "candidates" });
  if (candidateId) params.set("candidateId", candidateId);
  if (queue) params.set("queue", queue);
  return `/?${params.toString()}`;
}

function pipelineHref(stage: RecruiterPipelineStageId): string {
  const queueMap: Partial<Record<RecruiterPipelineStageId, string>> = {
    applied: "needs-review",
    "needs-review": "needs-review",
    interview: "interview-needed",
    paperwork: "paperwork-pending",
    "ready-for-mel": "ready-mel",
  };
  const queue = queueMap[stage];
  return candidatesHref(undefined, queue);
}

function countTrend7d(rows: ScoredCandidateWorkflowRow[], referenceMs: number): number {
  const since = referenceMs - 7 * MS_DAY;
  return rows.filter((row) => {
    const applied = Date.parse(row.appliedDate);
    return !Number.isNaN(applied) && applied >= since;
  }).length;
}

function filterOwned(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
): ScoredCandidateWorkflowRow[] {
  return candidates.filter((row) => ownedBy(row, actingRecruiter));
}

function buildTodayItems(
  owned: ScoredCandidateWorkflowRow[],
  referenceMs: number,
): RecruiterTodayItem[] {
  const items: Array<Omit<RecruiterTodayItem, "href"> & { queue?: string }> = [
    {
      id: "overdue-follow-ups",
      bucket: "must-do",
      label: "Overdue follow-ups",
      count: 0,
      candidateIds: [],
      queue: "overdue",
    },
    {
      id: "paperwork-stale",
      bucket: "must-do",
      label: "Paperwork pending > 48h",
      count: 0,
      candidateIds: [],
      queue: "paperwork-pending",
    },
    {
      id: "interviews-needed",
      bucket: "must-do",
      label: "Interviews needing scheduling",
      count: 0,
      candidateIds: [],
      queue: "interview-needed",
    },
    {
      id: "mel-ready",
      bucket: "must-do",
      label: "MEL ready candidates",
      count: 0,
      candidateIds: [],
      queue: "ready-mel",
    },
    {
      id: "new-applicants",
      bucket: "should-do",
      label: "New applicants",
      count: 0,
      candidateIds: [],
      queue: "needs-review",
    },
    {
      id: "strong-applicants",
      bucket: "should-do",
      label: "Strong applicants (Grade A/B)",
      count: 0,
      candidateIds: [],
      queue: "needs-review",
    },
    {
      id: "unassigned",
      bucket: "should-do",
      label: "Unassigned candidates",
      count: 0,
      candidateIds: [],
      queue: "unassigned",
    },
    {
      id: "follow-ups-tomorrow",
      bucket: "should-do",
      label: "Follow-ups due tomorrow",
      count: 0,
      candidateIds: [],
      queue: "needs-follow-up",
    },
    {
      id: "aging-candidates",
      bucket: "monitor",
      label: "Aging candidates",
      count: 0,
      candidateIds: [],
    },
    {
      id: "stalled-stages",
      bucket: "monitor",
      label: "Stalled workflow stages",
      count: 0,
      candidateIds: [],
    },
  ];

  for (const row of owned) {
    if (matchesRecruiterQuickFilter(row, "overdue", "", referenceMs)) {
      pushItem(items, "overdue-follow-ups", row.candidateId);
    }
    if (
      isPaperworkPendingStatus(row.workflowStatus) &&
      (hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0) >= 48
    ) {
      pushItem(items, "paperwork-stale", row.candidateId);
    }
    if (matchesRecruiterQuickFilter(row, "interview-needed", "", referenceMs)) {
      pushItem(items, "interviews-needed", row.candidateId);
    }
    if (matchesRecruiterQuickFilter(row, "ready-mel", "", referenceMs)) {
      pushItem(items, "mel-ready", row.candidateId);
    }
    if (isNewlyAppliedCandidate(row, referenceMs)) {
      pushItem(items, "new-applicants", row.candidateId);
    }
    if (
      (row.candidateGrade?.grade === "A" || row.candidateGrade?.grade === "B") &&
      isNewlyAppliedCandidate(row, referenceMs)
    ) {
      pushItem(items, "strong-applicants", row.candidateId);
    }
    if (isUnassignedRecruiter(row.assignedRecruiter)) {
      pushItem(items, "unassigned", row.candidateId);
    }
    const dueIn = hoursUntil(row.followUpDueAt, referenceMs);
    if (dueIn !== null && dueIn > 0 && dueIn <= 24) {
      pushItem(items, "follow-ups-tomorrow", row.candidateId);
    }
    const bucket = computeRecruiterAgingBucket(row, referenceMs);
    if (bucket === "3d" || bucket === "7d+") {
      pushItem(items, "aging-candidates", row.candidateId);
    }
    const inactiveHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);
    if (
      inactiveHours !== null &&
      inactiveHours >= 72 &&
      !["Not Qualified", "Active Rep", "Loaded in MEL"].includes(row.workflowStatus)
    ) {
      pushItem(items, "stalled-stages", row.candidateId);
    }
  }

  return items.map((item) => ({
    id: item.id,
    bucket: item.bucket,
    label: item.label,
    count: item.candidateIds.length,
    candidateIds: item.candidateIds,
    href: candidatesHref(item.candidateIds[0], item.queue),
  }));
}

function pushItem(
  items: Array<{ id: RecruiterTodayItemId; candidateIds: string[]; count: number }>,
  id: RecruiterTodayItemId,
  candidateId: string,
) {
  const item = items.find((entry) => entry.id === id);
  if (!item || item.candidateIds.includes(candidateId)) return;
  item.candidateIds.push(candidateId);
  item.count = item.candidateIds.length;
}

function pipelineStageRows(
  owned: ScoredCandidateWorkflowRow[],
  stage: RecruiterPipelineStageId,
): ScoredCandidateWorkflowRow[] {
  switch (stage) {
    case "applied":
      return owned.filter((row) => row.workflowStatus === "Applied");
    case "needs-review":
      return owned.filter((row) => row.workflowStatus === "Needs Review");
    case "interview":
      return owned.filter(
        (row) =>
          row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified",
      );
    case "paperwork":
      return owned.filter((row) => isPaperworkPendingStatus(row.workflowStatus));
    case "ready-for-mel":
      return owned.filter((row) => isMelReadyStatus(row.workflowStatus));
    case "hired":
      return owned.filter(
        (row) => row.workflowStatus === "Active Rep" || row.workflowStatus === "Loaded in MEL",
      );
    default:
      return [];
  }
}

function buildPipelineCards(
  owned: ScoredCandidateWorkflowRow[],
  referenceMs: number,
): RecruiterPipelineCard[] {
  const stages: Array<{ id: RecruiterPipelineStageId; label: string }> = [
    { id: "applied", label: "Applied" },
    { id: "needs-review", label: "Needs Review" },
    { id: "interview", label: "Interview" },
    { id: "paperwork", label: "Paperwork" },
    { id: "ready-for-mel", label: "Ready for MEL" },
    { id: "hired", label: "Hired" },
  ];

  return stages.map(({ id, label }) => {
    const rows = pipelineStageRows(owned, id);
    const agingWarning = rows.some((row) => {
      const days = calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs);
      return days !== null && days >= 5;
    });
    return {
      id,
      label,
      count: rows.length,
      trend7d: countTrend7d(rows, referenceMs),
      agingWarning,
      href: pipelineHref(id),
    };
  });
}

function eventInPeriod(createdAt: string, period: RecruiterProductivityPeriod, referenceMs: number): boolean {
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return false;
  const delta = referenceMs - ms;
  if (period === "today") return delta >= 0 && delta <= MS_DAY;
  if (period === "week") return delta >= 0 && delta <= 7 * MS_DAY;
  return delta >= 0 && delta <= 30 * MS_DAY;
}

function buildProductivityForPeriod(
  owned: ScoredCandidateWorkflowRow[],
  period: RecruiterProductivityPeriod,
  referenceMs: number,
): RecruiterProductivitySnapshot {
  let candidatesContacted = 0;
  let interviewsScheduled = 0;
  let paperworkSent = 0;
  let paperworkCompleted = 0;
  let readyForMel = 0;
  let hires = 0;

  for (const row of owned) {
    for (const event of row.history) {
      if (!eventInPeriod(event.createdAt, period, referenceMs)) continue;
      const message = event.message.toLowerCase();
      if (event.type === "note" || event.type === "status") candidatesContacted += 1;
      if (message.includes("interview")) interviewsScheduled += 1;
      if (event.type === "paperwork" && message.includes("sent")) paperworkSent += 1;
      if (event.type === "paperwork" && message.includes("signed")) paperworkCompleted += 1;
      if (message.includes("ready for mel")) readyForMel += 1;
      if (message.includes("active rep") || message.includes("loaded in mel")) hires += 1;
    }
    if (period === "today" && isMelReadyStatus(row.workflowStatus)) {
      readyForMel += 0;
    }
  }

  readyForMel = owned.filter((row) => isMelReadyStatus(row.workflowStatus)).length;
  hires = owned.filter(
    (row) => row.workflowStatus === "Active Rep" || row.workflowStatus === "Loaded in MEL",
  ).length;

  return {
    candidatesContacted,
    interviewsScheduled,
    paperworkSent,
    paperworkCompleted,
    readyForMel,
    hires,
  };
}

function buildProductivity(
  owned: ScoredCandidateWorkflowRow[],
  referenceMs: number,
): RecruiterProductivityByPeriod {
  return {
    today: buildProductivityForPeriod(owned, "today", referenceMs),
    week: buildProductivityForPeriod(owned, "week", referenceMs),
    month: buildProductivityForPeriod(owned, "month", referenceMs),
  };
}

function buildForecast(owned: ScoredCandidateWorkflowRow[], referenceMs: number): RecruiterHiringForecast {
  const enhanced = buildEnhancedHiringForecast(owned, referenceMs);
  return {
    readyForMel7d: enhanced.readyForMel7d,
    readyForMel30d: enhanced.readyForMel30d,
    expectedHires30d: enhanced.expectedHires30d,
    paperworkBottleneckCount: enhanced.paperworkBottleneckCount,
    interviewBottleneckCount: enhanced.interviewBottleneckCount,
    assumptions: enhanced.assumptions,
  };
}

function buildScorecard(
  owned: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  productivity: RecruiterProductivityByPeriod,
  referenceMs: number,
): RecruiterScorecard {
  let stagesMoved = 0;
  let responseHours: number[] = [];

  for (const row of owned) {
    stagesMoved += row.history.filter(
      (event) => event.type === "status" && eventInPeriod(event.createdAt, "week", referenceMs),
    ).length;
    const hours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);
    if (hours !== null) responseHours.push(hours);
  }

  return {
    recruiter: actingRecruiter,
    candidatesOwned: owned.length,
    tasksCompleted: productivity.today.candidatesContacted + productivity.today.paperworkSent,
    responseTimeHours:
      responseHours.length > 0
        ? Math.round(responseHours.reduce((sum, value) => sum + value, 0) / responseHours.length)
        : null,
    stagesMoved,
    readyForMel: productivity.today.readyForMel,
  };
}

function planLabel(row: ScoredCandidateWorkflowRow, actingRecruiter: string): string {
  const name = candidateName(row);
  const action = resolveWorkspaceAction({
    candidate: row,
    actingRecruiter,
    sendBlockReason: null,
  });
  switch (action.kind) {
    case "contact-candidate":
    case "follow-up-complete":
      return `Call ${name}`;
    case "send-paperwork":
      return `Send paperwork to ${name}`;
    case "schedule-interview":
      return `Schedule interview with ${name}`;
    case "review-application":
      return `Review application for ${name}`;
    case "ready-for-mel":
      return `Move ${name} to Ready for MEL`;
    default:
      return `Follow up with ${name}`;
  }
}

function buildDailyPlan(
  owned: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs: number,
): RecruiterDailyPlanAction[] {
  const prioritized = sortByRecruiterInboxPriority(owned, actingRecruiter, referenceMs).slice(0, 5);
  return prioritized.map((row, index) => ({
    id: row.candidateId,
    label: planLabel(row, actingRecruiter),
    candidateId: row.candidateId,
    href: candidatesHref(row.candidateId),
    priority: 5 - index,
  }));
}

export function buildRecruiterDashboardSnapshot(input: {
  candidates: ScoredCandidateWorkflowRow[];
  actingRecruiter: string;
  referenceMs?: number;
}): RecruiterDashboardSnapshot {
  const referenceMs = input.referenceMs ?? Date.now();
  const owned = filterOwned(input.candidates, input.actingRecruiter);
  const productivity = buildProductivity(owned, referenceMs);

  return {
    actingRecruiter: input.actingRecruiter,
    generatedAt: new Date(referenceMs).toISOString(),
    today: buildTodayItems(owned, referenceMs),
    pipeline: buildPipelineCards(owned, referenceMs),
    productivity,
    forecast: buildForecast(owned, referenceMs),
    scorecard: buildScorecard(owned, input.actingRecruiter, productivity, referenceMs),
    dailyPlan: [
      ...buildDailyPlan(owned, input.actingRecruiter, referenceMs),
      ...(buildDailyPlanBatchAction(owned, input.actingRecruiter, referenceMs)
        ? [buildDailyPlanBatchAction(owned, input.actingRecruiter, referenceMs)!]
        : []),
    ].slice(0, 5),
    autoTasks: buildRecruiterTasks(owned, { actingRecruiter: input.actingRecruiter, referenceMs }),
    workloadRecommendations: buildWorkloadBalanceRecommendations(input.candidates, referenceMs).filter(
      (row) => row.recruiter === input.actingRecruiter || row.recruiter === "Unassigned",
    ),
    funnelRiskSummary: summarizePipelineRisks(owned, referenceMs),
  };
}

export function buildDailyPlanBatchAction(
  owned: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs = Date.now(),
): RecruiterDailyPlanAction | null {
  const newCount = owned.filter((row) => isNewlyAppliedCandidate(row, referenceMs)).length;
  if (newCount < 3) return null;
  return {
    id: "batch-review",
    label: `Review ${newCount} new applicants`,
    candidateId: owned.find((row) => isNewlyAppliedCandidate(row, referenceMs))?.candidateId ?? "",
    href: candidatesHref(undefined, "needs-review"),
    priority: 3,
  };
}
