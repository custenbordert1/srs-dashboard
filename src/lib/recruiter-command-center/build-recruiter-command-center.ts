import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildCandidateSlaSnapshot } from "@/lib/candidate-action-sla";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { buildRecruiterActionDecision } from "@/lib/recruiter-action-engine/build-action-decision";
import { compareRecruiterActionPriority } from "@/lib/recruiter-priority";
import { scoreRecruiterWorkItemPriority } from "@/lib/recruiter-priority";
import {
  assignRecruiterWorkCategory,
  categoryLabel,
  isActionOverdue,
  resolveQueueAgeHours,
} from "@/lib/recruiter-command-center/score-recruiter-work-item";
import {
  RECRUITER_WORK_CATEGORY_ORDER,
  type RecruiterCommandCenter,
  type RecruiterCommandCenterKpi,
  type RecruiterCommandCenterQueueCounts,
  type RecruiterCommandCenterRecruiterSummary,
  type RecruiterCommandCenterWorkItem,
  type RecruiterWorkCategoryId,
} from "@/lib/recruiter-command-center/types";

const TERMINAL_STATUSES = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

function candidateDisplayName(row: ScoredCandidateWorkflowRow): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : row.candidateId;
}

function pickActiveOnboardingRecord(
  records: CandidateOnboardingRecord[],
  candidateId: string,
): CandidateOnboardingRecord | null {
  const forCandidate = records.filter((record) => record.candidateId === candidateId);
  if (forCandidate.length === 0) return null;
  const active = forCandidate.find(
    (record) =>
      record.status !== "failed" &&
      record.status !== "declined" &&
      record.status !== "expired",
  );
  return active ?? forCandidate[0] ?? null;
}

function resolvePositionUrgency(
  row: ScoredCandidateWorkflowRow,
  coverageNeeds: TerritoryCoverageNeed[],
) {
  const state = normalizeStateCode(row.state ?? "");
  const dm = getDmForState(state) ?? "Unassigned";
  const need = coverageNeeds.find((entry) => entry.dmName === dm || entry.states.includes(state));
  return need?.coverageStatus ?? "Healthy";
}

function emptyCategoryCounts(): Record<RecruiterWorkCategoryId, number> {
  return Object.fromEntries(
    RECRUITER_WORK_CATEGORY_ORDER.map((id) => [id, 0]),
  ) as Record<RecruiterWorkCategoryId, number>;
}

function buildKpis(
  workQueue: RecruiterCommandCenterWorkItem[],
  queueCounts: RecruiterCommandCenterQueueCounts,
): RecruiterCommandCenterKpi[] {
  return [
    {
      id: "total-work",
      label: "Active work items",
      value: queueCounts.total,
      alert: queueCounts.total > 0,
    },
    {
      id: "high-priority",
      label: "High priority",
      value: queueCounts.highPriority,
      alert: queueCounts.highPriority > 0,
    },
    {
      id: "overdue",
      label: "Overdue actions",
      value: queueCounts.overdue,
      alert: queueCounts.overdue > 0,
    },
    {
      id: "sla-risk",
      label: "SLA risks",
      value: queueCounts.slaRisk,
      alert: queueCounts.slaRisk > 0,
    },
    {
      id: "recruiters",
      label: "Recruiters with work",
      value: new Set(workQueue.map((item) => item.recruiter)).size,
    },
  ];
}

function buildRecruiterSummaries(
  workQueue: RecruiterCommandCenterWorkItem[],
): RecruiterCommandCenterRecruiterSummary[] {
  const byRecruiter = new Map<string, RecruiterCommandCenterRecruiterSummary>();

  for (const item of workQueue) {
    const key = item.recruiter.trim() || "Unassigned";
    const existing = byRecruiter.get(key) ?? {
      recruiter: key,
      totalWorkItems: 0,
      highPriorityCount: 0,
      overdueCount: 0,
      slaRiskCount: 0,
      categoryCounts: emptyCategoryCounts(),
    };
    existing.totalWorkItems += 1;
    if (item.priorityLevel === "high") existing.highPriorityCount += 1;
    if (item.actionOverdue) existing.overdueCount += 1;
    if (item.slaRisk) existing.slaRiskCount += 1;
    existing.categoryCounts[item.category] += 1;
    byRecruiter.set(key, existing);
  }

  return [...byRecruiter.values()].sort(
    (a, b) => b.totalWorkItems - a.totalWorkItems || a.recruiter.localeCompare(b.recruiter),
  );
}

function buildQueueCounts(workQueue: RecruiterCommandCenterWorkItem[]): RecruiterCommandCenterQueueCounts {
  const categoryCounts = emptyCategoryCounts();
  let highPriority = 0;
  let mediumPriority = 0;
  let lowPriority = 0;
  let overdue = 0;
  let slaRisk = 0;

  for (const item of workQueue) {
    categoryCounts[item.category] += 1;
    if (item.priorityLevel === "high") highPriority += 1;
    else if (item.priorityLevel === "medium") mediumPriority += 1;
    else lowPriority += 1;
    if (item.actionOverdue) overdue += 1;
    if (item.slaRisk) slaRisk += 1;
  }

  return {
    ...categoryCounts,
    total: workQueue.length,
    highPriority,
    mediumPriority,
    lowPriority,
    overdue,
    slaRisk,
  };
}

export function buildRecruiterCommandCenter(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords?: CandidateOnboardingRecord[];
  coverageNeeds?: TerritoryCoverageNeed[];
  recruiterFilter?: string | null;
  limit?: number;
  fetchedAt?: string;
}): RecruiterCommandCenter {
  const referenceMs = Date.parse(input.fetchedAt ?? new Date().toISOString());
  const coverageNeeds = input.coverageNeeds ?? [];
  const onboardingRecords = input.onboardingRecords ?? [];
  const recruiterFilter = input.recruiterFilter?.trim() || null;
  const limit = input.limit ?? 200;

  const recruiterWorkload = new Map<string, number>();
  for (const candidate of input.candidates) {
    if (TERMINAL_STATUSES.has(candidate.workflowStatus)) continue;
    const key = candidate.assignedRecruiter.trim() || "Unassigned";
    recruiterWorkload.set(key, (recruiterWorkload.get(key) ?? 0) + 1);
  }

  const workItems: RecruiterCommandCenterWorkItem[] = [];

  for (const row of input.candidates) {
    if (TERMINAL_STATUSES.has(row.workflowStatus)) continue;

    const recruiterKey = row.assignedRecruiter.trim() || "Unassigned";
    if (recruiterFilter && recruiterKey !== recruiterFilter) continue;

    const onboarding = pickActiveOnboardingRecord(onboardingRecords, row.candidateId);
    const action = buildRecruiterActionDecision(row, referenceMs);
    const actionOverdue = isActionOverdue(action.actionDueDate, referenceMs);
    const category = assignRecruiterWorkCategory(row, onboarding, actionOverdue, referenceMs);
    const sla = buildCandidateSlaSnapshot({
      appliedDate: row.appliedDate,
      workflowStatus: row.workflowStatus,
      lastActionAt: row.lastActionAt,
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      snoozedUntil: row.snoozedUntil,
      referenceMs,
    });
    const positionUrgency = resolvePositionUrgency(row, coverageNeeds);
    const queueAgeHours = resolveQueueAgeHours(row, referenceMs);

    const scored = scoreRecruiterWorkItemPriority({
      row,
      sla,
      queueAgeHours,
      positionUrgency,
      recruiterQueueCount: recruiterWorkload.get(recruiterKey) ?? 1,
      probabilityOfHire: row.matchPercent > 0 ? row.matchPercent / 100 : null,
      actionDueDate: action.actionDueDate,
      actionPriority: action.actionPriority,
      actionOverdue,
      referenceMs,
    });

    const slaRisk =
      sla.appliedAgingSeverity === "critical" ||
      sla.paperworkAgingSeverity === "critical" ||
      sla.recruiterInactivitySeverity === "critical" ||
      sla.followUpOverdue;

    workItems.push({
      candidateId: row.candidateId,
      candidateName: candidateDisplayName(row),
      email: row.email?.trim() || null,
      recruiter: recruiterKey,
      positionName: row.positionName ?? "—",
      positionId: row.positionId ?? "",
      grade: row.aiGrade,
      workflowStatus: row.workflowStatus,
      category,
      categoryLabel: categoryLabel(category),
      nextAction: action.requiredAction,
      actionType: action.actionType,
      actionPriority: action.actionPriority,
      actionDueDate: action.actionDueDate,
      actionOverdue,
      priorityScore: scored.priorityScore,
      priorityLevel: scored.priorityLevel,
      priorityReasons: scored.priorityReasons,
      positionUrgency,
      slaRisk,
      coverageUrgent: positionUrgency === "Critical" || positionUrgency === "At Risk",
      queueAgeHours,
    });
  }

  const sorted = workItems.sort((a, b) => {
    const actionDiff = compareRecruiterActionPriority(
      {
        actionDueDate: a.actionDueDate,
        actionPriority: a.actionPriority,
        candidateId: a.candidateId,
      },
      {
        actionDueDate: b.actionDueDate,
        actionPriority: b.actionPriority,
        candidateId: b.candidateId,
      },
      referenceMs,
    );
    if (actionDiff !== 0) return actionDiff;
    return b.priorityScore - a.priorityScore || a.candidateId.localeCompare(b.candidateId);
  });

  const limited = sorted.slice(0, limit);
  const queueCounts = buildQueueCounts(sorted);
  const recruiterSummaries = buildRecruiterSummaries(sorted);

  return {
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    scope: "mtd",
    readOnly: true,
    kpis: buildKpis(sorted, queueCounts),
    recruiterSummaries,
    workQueue: limited,
    topPriorities: sorted.filter((item) => item.priorityLevel === "high").slice(0, 25),
    queueCounts,
  };
}
