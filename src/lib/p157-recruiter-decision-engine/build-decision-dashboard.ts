import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import {
  buildScoringContextForRow,
  pickActiveOnboardingRecord,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { decideCandidateAction } from "@/lib/p157-recruiter-decision-engine/decision-engine";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { sortDecisionsByPriority } from "@/lib/p157-recruiter-decision-engine/recommendation-builder";
import {
  P157_BLOCKED_ACTIONS,
  P157_HIGH_CONFIDENCE_THRESHOLD,
} from "@/lib/p157-recruiter-decision-engine/constants";
import { isHighConfidenceDecision } from "@/lib/p157-recruiter-decision-engine/confidence-score";
import type {
  P157CandidateDecision,
  P157DecisionAction,
  P157DecisionDashboard,
  P157DecisionDistribution,
  P157DecisionFilters,
  P157ExecutiveSummary,
} from "@/lib/p157-recruiter-decision-engine/types";
import { P157_SOURCE_PHASE } from "@/lib/p157-recruiter-decision-engine/types";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

function matchesFilters(row: P157CandidateDecision, filters: P157DecisionFilters): boolean {
  if (filters.recruiter && row.recruiter !== filters.recruiter) return false;
  if (filters.dm && row.dm !== filters.dm) return false;
  if (filters.state && normalizeStateCode(row.state ?? "") !== normalizeStateCode(filters.state)) {
    return false;
  }
  if (filters.project && row.project !== filters.project) return false;
  if (filters.decision && row.action !== filters.decision) return false;
  if (filters.confidenceMin != null && row.confidence < filters.confidenceMin) return false;
  if (filters.priorityMin != null && row.priorityScore < filters.priorityMin) return false;
  return true;
}

function buildFilterOptions(decisions: P157CandidateDecision[]) {
  const recruiters = new Set<string>();
  const dms = new Set<string>();
  const states = new Set<string>();
  const projects = new Set<string>();
  const decisionActions = new Set<P157DecisionAction>();

  for (const row of decisions) {
    recruiters.add(row.recruiter);
    dms.add(row.dm);
    if (row.state) states.add(normalizeStateCode(row.state));
    if (row.project) projects.add(row.project);
    decisionActions.add(row.action);
  }

  const sort = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));

  return {
    recruiters: sort(recruiters),
    dms: sort(dms),
    states: sort(states),
    projects: sort(projects),
    decisions: [...decisionActions].sort((a, b) => a.localeCompare(b)),
  };
}

function buildDistribution(decisions: P157CandidateDecision[]): P157DecisionDistribution[] {
  const byAction = new Map<P157DecisionAction, { count: number; confidenceSum: number }>();

  for (const row of decisions) {
    const existing = byAction.get(row.action) ?? { count: 0, confidenceSum: 0 };
    existing.count += 1;
    existing.confidenceSum += row.confidence;
    byAction.set(row.action, existing);
  }

  return [...byAction.entries()]
    .map(([action, stats]) => ({
      action,
      count: stats.count,
      avgConfidence: Math.round(stats.confidenceSum / stats.count),
    }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
}

function buildSummary(decisions: P157CandidateDecision[]): P157ExecutiveSummary {
  const highConfidenceCount = decisions.filter((d) => isHighConfidenceDecision(d.confidence)).length;
  const manualReviewCount = decisions.filter((d) => d.action === "Manual Review").length;
  const blockedCount = decisions.filter((d) => P157_BLOCKED_ACTIONS.has(d.action)).length;
  const distribution = buildDistribution(decisions);
  const avgConfidence =
    decisions.length > 0
      ? Math.round(decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length)
      : 0;

  return {
    totalCandidates: decisions.length,
    highConfidenceCount,
    manualReviewCount,
    blockedCount,
    topAction: distribution[0]?.action ?? null,
    avgConfidence,
  };
}

export function buildDecisionDashboardFromCohort(
  cohort: Awaited<ReturnType<typeof loadDecisionCohort>>,
  filters: P157DecisionFilters = {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    decision: null,
    confidenceMin: null,
    priorityMin: null,
  },
): P157DecisionDashboard {
  const referenceMs = Date.parse(cohort.fetchedAt);
  const priorityQueue = buildPrioritizedQueueFromCohort(cohort, {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    priorityMin: null,
    priorityMax: null,
    stage: null,
  });

  const priorityById = new Map(
    priorityQueue.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );

  const recruiterWorkload = new Map<string, number>();
  for (const row of cohort.candidates) {
    if (TERMINAL_STATUSES.has(row.workflowStatus)) continue;
    const key = row.assignedRecruiter.trim() || "Unassigned";
    recruiterWorkload.set(key, (recruiterWorkload.get(key) ?? 0) + 1);
  }

  const allComputed: P157CandidateDecision[] = [];

  for (const row of cohort.candidates) {
    if (TERMINAL_STATUSES.has(row.workflowStatus)) continue;

    const priority = priorityById.get(row.candidateId);
    if (!priority) continue;

    const candidate = cohort.candidatesById.get(row.candidateId);
    if (!candidate) continue;

    const onboarding = pickActiveOnboardingRecord(cohort.onboardingRecords, row.candidateId);
    const scoringMeta = buildScoringContextForRow({
      row,
      coverageNeeds: cohort.coverageNeeds,
      opportunities: cohort.opportunities,
      jobsByPositionId: cohort.jobsByPositionId,
      referenceMs,
    });
    const job = cohort.jobsByPositionId.get(row.positionId);
    const recruiterKey = row.assignedRecruiter.trim() || "Unassigned";

    allComputed.push(
      decideCandidateAction({
        row,
        candidate,
        onboarding,
        auditEvents: cohort.auditEvents,
        priority,
        scoringMeta: {
          openDemand: scoringMeta.openDemand,
          coverageStatus: scoringMeta.coverageStatus,
          daysUntilProjectStart: scoringMeta.daysUntilProjectStart,
          projectName: scoringMeta.projectName,
          jobStatus: job?.status ?? null,
          jobPublished: job?.status === "published",
        },
        recruiterWorkload: recruiterWorkload.get(recruiterKey) ?? 1,
        referenceMs,
      }),
    );
  }

  const sortedAll = sortDecisionsByPriority(allComputed);
  const sorted = sortedAll.filter((decision) => matchesFilters(decision, filters));

  return {
    generatedAt: cohort.fetchedAt,
    readOnly: true,
    sourcePhase: P157_SOURCE_PHASE,
    filters,
    summary: buildSummary(sorted),
    decisions: sorted,
    sections: {
      recommendedActions: sorted,
      highConfidence: sorted.filter((d) => d.confidence >= P157_HIGH_CONFIDENCE_THRESHOLD),
      manualReview: sorted.filter((d) => d.action === "Manual Review"),
      needsRecruiter: sorted.filter(
        (d) => d.action === "Assign Recruiter" || isUnassignedRecruiter(d.recruiter),
      ),
      needsDm: sorted.filter((d) => d.action === "Escalate To DM"),
      needsPaperwork: sorted.filter((d) => d.action === "Send Paperwork"),
      readyForMel: sorted.filter((d) => d.action === "Ready For MEL"),
      blocked: sorted.filter((d) => P157_BLOCKED_ACTIONS.has(d.action)),
      top25: sorted.slice(0, 25),
    },
    distribution: buildDistribution(sorted),
    filterOptions: buildFilterOptions(sortedAll),
    warnings: cohort.warnings,
  };
}

export async function buildDecisionDashboard(
  filters: P157DecisionFilters = {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    decision: null,
    confidenceMin: null,
    priorityMin: null,
  },
): Promise<P157DecisionDashboard> {
  const cohort = await loadDecisionCohort();
  return buildDecisionDashboardFromCohort(cohort, filters);
}

export function parseP157DecisionFilters(url: URL): P157DecisionFilters {
  const confidenceMinRaw = url.searchParams.get("confidenceMin") ?? url.searchParams.get("confidence");
  const priorityMinRaw = url.searchParams.get("priorityMin") ?? url.searchParams.get("priority");
  const decision = url.searchParams.get("decision")?.trim() as P157DecisionAction | undefined;

  return {
    recruiter: url.searchParams.get("recruiter")?.trim() || null,
    dm: url.searchParams.get("dm")?.trim() || null,
    state: url.searchParams.get("state")?.trim() || null,
    project: url.searchParams.get("project")?.trim() || null,
    decision: decision || null,
    confidenceMin: confidenceMinRaw ? Number.parseInt(confidenceMinRaw, 10) : null,
    priorityMin: priorityMinRaw ? Number.parseInt(priorityMinRaw, 10) : null,
  };
}
