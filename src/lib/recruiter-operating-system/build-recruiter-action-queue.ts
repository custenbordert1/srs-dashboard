import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  calendarDaysSince,
  isFollowUpOverdue,
} from "@/lib/candidate-action-sla";
import { isNoResponseCandidate } from "@/lib/recruiter-action-queue-filters";
import { filterWorkQueueForRecruiterScope } from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import { buildScopedCandidateRows, candidateDisplayName } from "@/lib/recruiter-operating-system/build-scoped-rows";
import type {
  RecruiterActionQueueCategory,
  RecruiterActionQueueItem,
  RecruiterOperatingSystemScope,
} from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { compareWorkQueueItems } from "@/lib/unified-recruiting-command-center/compare-work-queue";
import type { CommandCenterWorkQueueItem } from "@/lib/unified-recruiting-command-center/types";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const ACTION_QUEUE_LIMIT = 30;

function categorizeWorkQueueItem(item: CommandCenterWorkQueueItem): RecruiterActionQueueCategory {
  if (item.type === "follow-up") return "candidate-follow-up";
  if (item.type === "recommendation") {
    if (item.title.toLowerCase().includes("escalat")) return "dm-escalation";
    if (item.title.toLowerCase().includes("coverage") || item.title.toLowerCase().includes("store")) {
      return "store-coverage";
    }
    return "territory-recommendation";
  }
  if (item.title.toLowerCase().includes("re-engage") || item.title.toLowerCase().includes("reopen")) {
    return "re-engagement";
  }
  if (item.title.toLowerCase().includes("escalat")) return "dm-escalation";
  return "territory-recommendation";
}

function candidateQueueScores(
  row: ScoredCandidateWorkflowRow,
  bundle: RecruitingIntelligenceRouteBundle,
  referenceMs: number,
): {
  placementLikelihood: number;
  coverageImpact: number;
  responsivenessScore: number;
  urgencyScore: number;
  priorityScore: number;
  category: RecruiterActionQueueCategory;
} {
  const appliedDays = calendarDaysSince(row.appliedDate, referenceMs) ?? 0;
  const followUpOverdue = isFollowUpOverdue({
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    referenceMs,
  });
  const placementLikelihood = Math.min(100, Math.round((row.matchPercent ?? 0) * 0.7 + (row.aiNumericScore ?? 0) * 0.3));
  const openCalls = bundle.opportunities.filter(
    (opp) =>
      opp.openStatus &&
      !opp.isStaffed &&
      normalizeStateCode(opp.state) === normalizeStateCode(row.state),
  ).length;
  const coverageImpact = Math.min(100, openCalls * 12 + (row.isTopMatch ? 20 : 0));
  const responsivenessScore = isNoResponseCandidate(row, referenceMs)
    ? 20
    : Math.max(10, 100 - (calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 30) * 5);
  const urgencyScore = Math.min(
    100,
    (followUpOverdue ? 40 : 0) +
      (row.recruitingActions.needsFollowUp ? 25 : 0) +
      appliedDays * 2 +
      (row.recruitingActions.priorityList ? 15 : 0),
  );
  const priorityScore = Math.round(
    placementLikelihood * 0.3 +
      coverageImpact * 0.25 +
      responsivenessScore * 0.15 +
      urgencyScore * 0.3,
  );
  const category: RecruiterActionQueueCategory = followUpOverdue
    ? "candidate-follow-up"
    : isNoResponseCandidate(row, referenceMs)
      ? "re-engagement"
      : row.dmNeedsAssignment
        ? "dm-escalation"
        : openCalls > 0
          ? "store-coverage"
          : "candidate-follow-up";

  return {
    placementLikelihood,
    coverageImpact,
    responsivenessScore,
    urgencyScore,
    priorityScore,
    category,
  };
}

function buildCandidateActionItems(
  bundle: RecruitingIntelligenceRouteBundle,
  scope: RecruiterOperatingSystemScope,
  referenceMs: number,
): RecruiterActionQueueItem[] {
  const rows = buildScopedCandidateRows(bundle, scope);
  const items: RecruiterActionQueueItem[] = [];

  for (const row of rows) {
    const scores = candidateQueueScores(row, bundle, referenceMs);
    if (scores.priorityScore < 25) continue;

    const opp = bundle.opportunities.find(
      (item) => normalizeStateCode(item.state) === normalizeStateCode(row.state),
    );

    items.push({
      id: `recruiter-candidate:${row.candidateId}`,
      type: "daily-action",
      priority: scores.urgencyScore >= 60 ? "high" : scores.urgencyScore >= 35 ? "medium" : "low",
      territory: row.state || "—",
      owner: row.assignedRecruiter?.trim() || scope.recruiterLabel,
      dueDate: row.followUpDueAt ?? row.appliedDate ?? bundle.fetchedAt,
      status: scores.urgencyScore >= 60 ? "overdue" : "open",
      impactScore: scores.priorityScore,
      impactLabel: `${scores.placementLikelihood}% placement likelihood`,
      title: `${candidateDisplayName(row)} · ${row.workflowStatus}`,
      subtitle: `${opp?.storeName ?? row.city} · ${scores.category.replace(/-/g, " ")}`,
      isOverdue: scores.urgencyScore >= 60,
      sourceDailyActionId: row.candidateId,
      category: scores.category,
      candidateId: row.candidateId,
      candidateName: candidateDisplayName(row),
      storeName: opp?.storeName,
      projectName: opp?.projectName,
      placementLikelihood: scores.placementLikelihood,
      coverageImpact: scores.coverageImpact,
      responsivenessScore: scores.responsivenessScore,
      urgencyScore: scores.urgencyScore,
      priorityScore: scores.priorityScore,
    });
  }

  return items;
}

function enrichWorkQueueItem(
  item: CommandCenterWorkQueueItem,
  bundle: RecruitingIntelligenceRouteBundle,
): RecruiterActionQueueItem {
  const category = categorizeWorkQueueItem(item);
  const placementLikelihood = Math.min(100, Math.round(item.impactScore * 0.6));
  const coverageImpact = category === "store-coverage" ? item.impactScore : Math.round(item.impactScore * 0.4);
  const responsivenessScore = item.type === "follow-up" ? 70 : 50;
  const urgencyScore = item.isOverdue ? 85 : item.priority === "critical" ? 75 : 45;
  const priorityScore = Math.round(
    placementLikelihood * 0.3 +
      coverageImpact * 0.25 +
      responsivenessScore * 0.15 +
      urgencyScore * 0.3,
  );

  const linkedCandidateId = item.subtitle.match(/candidate[:\s]+([a-z0-9-]+)/i)?.[1];

  return {
    ...item,
    category,
    candidateId: linkedCandidateId,
    placementLikelihood,
    coverageImpact,
    responsivenessScore,
    urgencyScore,
    priorityScore,
    storeName: bundle.opportunities.find((opp) => item.subtitle.includes(opp.storeName))?.storeName,
    projectName: bundle.opportunities.find((opp) => item.subtitle.includes(opp.projectName))?.projectName,
  };
}

export function compareRecruiterActionQueueItems(
  a: RecruiterActionQueueItem,
  b: RecruiterActionQueueItem,
): number {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  return compareWorkQueueItems(a, b);
}

export function buildRecruiterActionQueue(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  workQueue: CommandCenterWorkQueueItem[];
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
}): RecruiterActionQueueItem[] {
  const platformItems = filterWorkQueueForRecruiterScope(input.workQueue, input.scope).map((item) =>
    enrichWorkQueueItem(item, input.bundle),
  );
  const candidateItems = buildCandidateActionItems(input.bundle, input.scope, input.referenceMs);
  const merged = [...platformItems, ...candidateItems];
  const deduped = new Map<string, RecruiterActionQueueItem>();
  for (const item of merged) {
    const existing = deduped.get(item.id);
    if (!existing || item.priorityScore > existing.priorityScore) {
      deduped.set(item.id, item);
    }
  }
  return [...deduped.values()]
    .sort(compareRecruiterActionQueueItems)
    .slice(0, ACTION_QUEUE_LIMIT);
}
