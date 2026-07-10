import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  buildCandidateSlaSnapshot,
  isFollowUpOverdue,
  isMelReadyStatus,
} from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import {
  buildScoringContextForRow,
  loadPrioritizationCohort,
  pickActiveOnboardingRecord,
  type P156PrioritizationCohort,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildP156RecommendedNextAction } from "@/lib/p156-candidate-prioritization/recommendation-builder";
import { scoreCandidatePriorityFactors } from "@/lib/p156-candidate-prioritization/scoring-engine";
import { buildPriorityExplanation } from "@/lib/p156-candidate-prioritization/explanation-generator";
import {
  computeWeightedPriorityScore,
  resolveP156PriorityLevel,
} from "@/lib/p156-candidate-prioritization/weighting-model";
import type {
  P156DemandMarket,
  P156PrioritizedCandidate,
  P156PrioritizedQueue,
  P156QueueFilters,
  P156RiskPosition,
} from "@/lib/p156-candidate-prioritization/types";
import { P156_SOURCE_PHASE } from "@/lib/p156-candidate-prioritization/types";
import {
  isActionOverdue,
  matchesRecruiterWorkCategory,
} from "@/lib/recruiter-command-center/score-recruiter-work-item";
import { buildRecruiterActionDecision } from "@/lib/recruiter-action-engine/build-action-decision";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

function candidateDisplayName(row: ScoredCandidateWorkflowRow): string {
  const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return name || row.email?.trim() || row.candidateId;
}

function matchesFilters(row: P156PrioritizedCandidate, filters: P156QueueFilters): boolean {
  if (filters.recruiter && row.recruiter !== filters.recruiter) return false;
  if (filters.dm && row.dm !== filters.dm) return false;
  if (filters.state && normalizeStateCode(row.state ?? "") !== normalizeStateCode(filters.state)) {
    return false;
  }
  if (filters.project && row.project !== filters.project) return false;
  if (filters.stage && row.workflowStatus !== filters.stage) return false;
  if (filters.priorityMin != null && row.priorityScore < filters.priorityMin) return false;
  if (filters.priorityMax != null && row.priorityScore > filters.priorityMax) return false;
  return true;
}

function buildFilterOptions(candidates: P156PrioritizedCandidate[]) {
  const recruiters = new Set<string>();
  const dms = new Set<string>();
  const states = new Set<string>();
  const projects = new Set<string>();
  const stages = new Set<string>();

  for (const row of candidates) {
    recruiters.add(row.recruiter);
    dms.add(row.dm);
    if (row.state) states.add(normalizeStateCode(row.state));
    if (row.project) projects.add(row.project);
    stages.add(row.workflowStatus);
  }

  const sort = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));

  return {
    recruiters: sort(recruiters),
    dms: sort(dms),
    states: sort(states),
    projects: sort(projects),
    stages: sort(stages),
  };
}

function buildHighestRiskPositions(candidates: P156PrioritizedCandidate[]): P156RiskPosition[] {
  const byPosition = new Map<string, P156RiskPosition>();

  for (const row of candidates) {
    const existing = byPosition.get(row.positionId) ?? {
      positionName: row.position,
      positionId: row.positionId,
      urgency: "Healthy" as const,
      openDemand: row.openDemand,
      candidateCount: 0,
      topCandidateScore: 0,
    };
    existing.candidateCount += 1;
    existing.topCandidateScore = Math.max(existing.topCandidateScore, row.priorityScore);
    existing.openDemand = Math.max(existing.openDemand, row.openDemand);
    if (row.openDemand >= 15 || row.priorityScore >= 80) {
      existing.urgency = "Critical";
    } else if (row.openDemand >= 8 || row.priorityScore >= 65) {
      existing.urgency = existing.urgency === "Critical" ? "Critical" : "At Risk";
    }
    byPosition.set(row.positionId, existing);
  }

  return [...byPosition.values()]
    .sort(
      (a, b) =>
        b.topCandidateScore - a.topCandidateScore ||
        b.openDemand - a.openDemand ||
        a.positionName.localeCompare(b.positionName),
    )
    .slice(0, 15);
}

function buildHighestDemandMarkets(cohort: P156PrioritizationCohort): P156DemandMarket[] {
  return cohort.coverageNeeds
    .map((need) => ({
      territory: need.territoryLabel,
      dmName: need.dmName,
      states: need.states,
      openCalls: need.openCalls,
      coverageStatus: need.coverageStatus,
      coverageNeedScore: need.coverageNeedScore,
    }))
    .sort((a, b) => b.openCalls - a.openCalls || b.coverageNeedScore - a.coverageNeedScore)
    .slice(0, 12);
}

function scoreCandidateRow(
  row: ScoredCandidateWorkflowRow,
  cohort: P156PrioritizationCohort,
  referenceMs: number,
): P156PrioritizedCandidate {
  const onboarding = pickActiveOnboardingRecord(cohort.onboardingRecords, row.candidateId);
  const contextMeta = buildScoringContextForRow({
    row,
    coverageNeeds: cohort.coverageNeeds,
    opportunities: cohort.opportunities,
    jobsByPositionId: cohort.jobsByPositionId,
    referenceMs,
  });

  const factors = scoreCandidatePriorityFactors({
    row,
    context: {
      openDemand: contextMeta.openDemand,
      coverageStatus: contextMeta.coverageStatus,
      coverageNeedScore: contextMeta.coverageNeedScore,
      territoryLabel: contextMeta.territoryLabel,
      dmName: contextMeta.dmName,
      daysUntilProjectStart: contextMeta.daysUntilProjectStart,
      hasActiveCampaign: contextMeta.hasActiveCampaign,
      isContinuityProject: contextMeta.isContinuityProject,
      nearestDistanceMiles: contextMeta.nearestDistanceMiles,
      referenceMs,
    },
    job: cohort.jobsByPositionId.get(row.positionId) ?? null,
  });

  const { priorityScore, factorBreakdown } = computeWeightedPriorityScore(factors);
  const reasoning = buildPriorityExplanation({ priorityScore, factorBreakdown });
  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });

  return {
    candidateId: row.candidateId,
    candidateName: candidateDisplayName(row),
    email: row.email?.trim() || null,
    priorityScore,
    priorityLevel: resolveP156PriorityLevel(priorityScore),
    reasoning,
    recommendedNextAction: buildP156RecommendedNextAction({
      row,
      onboarding,
      coverageStatus: contextMeta.coverageStatus,
      openDemand: contextMeta.openDemand,
      referenceMs,
    }),
    recruiter: row.assignedRecruiter.trim() || "Unassigned",
    dm: row.assignedDM?.trim() || contextMeta.dmName || "Unassigned",
    position: row.positionName ?? "—",
    positionId: row.positionId ?? "",
    project: contextMeta.projectName,
    territory: contextMeta.territoryLabel,
    state: row.state?.trim() || null,
    openDemand: contextMeta.openDemand,
    daysInPipeline: sla.appliedDays,
    workflowStatus: row.workflowStatus,
    factorBreakdown,
  };
}

export function buildPrioritizedQueueFromCohort(
  cohort: P156PrioritizationCohort,
  filters: P156QueueFilters = {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    priorityMin: null,
    priorityMax: null,
    stage: null,
  },
): P156PrioritizedQueue {
  const referenceMs = Date.parse(cohort.fetchedAt);
  const scored: P156PrioritizedCandidate[] = [];

  for (const row of cohort.candidates) {
    if (TERMINAL_STATUSES.has(row.workflowStatus)) continue;
    const item = scoreCandidateRow(row, cohort, referenceMs);
    if (matchesFilters(item, filters)) {
      scored.push(item);
    }
  }

  scored.sort(
    (a, b) => b.priorityScore - a.priorityScore || a.candidateId.localeCompare(b.candidateId),
  );

  const allScored = cohort.candidates
    .filter((row) => !TERMINAL_STATUSES.has(row.workflowStatus))
    .map((row) => scoreCandidateRow(row, cohort, referenceMs));

  const topPriority = scored.slice(0, 25);

  const readyForPaperwork: P156PrioritizedCandidate[] = [];
  const awaitingRecruiter: P156PrioritizedCandidate[] = [];
  const awaitingFollowUp: P156PrioritizedCandidate[] = [];
  const readyForMel: P156PrioritizedCandidate[] = [];

  for (const item of scored) {
    const row = cohort.candidates.find((c) => c.candidateId === item.candidateId);
    if (!row) continue;
    const onboarding = pickActiveOnboardingRecord(cohort.onboardingRecords, row.candidateId);
    const action = buildRecruiterActionDecision(row, referenceMs);
    const actionOverdue = isActionOverdue(action.actionDueDate, referenceMs);

    if (isMelReadyStatus(row.workflowStatus)) {
      readyForMel.push(item);
    }
    if (isUnassignedRecruiter(row.assignedRecruiter)) {
      awaitingRecruiter.push(item);
    }
    if (
      row.recruitingActions.needsFollowUp ||
      row.followUpDueAt ||
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      })
    ) {
      awaitingFollowUp.push(item);
    }
    const paperworkStage = classifyPaperworkStage({ row, onboarding });
    if (
      paperworkStage === "awaitingRecruiterAction" ||
      row.workflowStatus === "Paperwork Needed" ||
      paperworkStage === "approvalQueue" ||
      matchesRecruiterWorkCategory("ready-for-paperwork", row, onboarding, actionOverdue, referenceMs)
    ) {
      readyForPaperwork.push(item);
    }
  }

  return {
    generatedAt: cohort.fetchedAt,
    readOnly: true,
    sourcePhase: P156_SOURCE_PHASE,
    filters,
    candidates: scored,
    sections: {
      topPriority,
      highestRiskPositions: buildHighestRiskPositions(scored),
      highestDemandMarkets: buildHighestDemandMarkets(cohort),
      readyForPaperwork: readyForPaperwork.slice(0, 25),
      awaitingRecruiter: awaitingRecruiter.slice(0, 25),
      awaitingFollowUp: awaitingFollowUp.slice(0, 25),
      readyForMel: readyForMel.slice(0, 25),
    },
    filterOptions: buildFilterOptions(allScored),
    warnings: cohort.warnings,
  };
}

export async function buildPrioritizedQueue(
  filters: P156QueueFilters = {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    priorityMin: null,
    priorityMax: null,
    stage: null,
  },
): Promise<P156PrioritizedQueue> {
  const cohort = await loadPrioritizationCohort();
  return buildPrioritizedQueueFromCohort(cohort, filters);
}

export function parseP156QueueFilters(url: URL): P156QueueFilters {
  const priorityMinRaw = url.searchParams.get("priorityMin");
  const priorityMaxRaw = url.searchParams.get("priorityMax");

  return {
    recruiter: url.searchParams.get("recruiter")?.trim() || null,
    dm: url.searchParams.get("dm")?.trim() || null,
    state: url.searchParams.get("state")?.trim() || null,
    project: url.searchParams.get("project")?.trim() || null,
    stage: url.searchParams.get("stage")?.trim() || null,
    priorityMin: priorityMinRaw ? Number.parseInt(priorityMinRaw, 10) : null,
    priorityMax: priorityMaxRaw ? Number.parseInt(priorityMaxRaw, 10) : null,
  };
}
