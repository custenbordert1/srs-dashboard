import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { parseDate, MS_PER_DAY } from "@/lib/dm-dashboard/territory-shared";
import {
  DISTRICT_MANAGERS,
  getAssignedStatesForDm,
  normalizeStateCode,
  type DistrictManager,
} from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { filterOpportunitiesByTerritory } from "@/lib/mel-matching/mel-opportunity-parser";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import { countWorkflowReadyForMel, isHiredStage } from "@/lib/territory-intelligence/metric-calculators";
import { assessMelIntegrationReadiness } from "@/lib/workforce-ops-center/mel-integration-service";
import type {
  MelOpportunityManagementRow,
  MelOpportunityManagementSummary,
  MelPipelineItem,
  TerritoryDrilldownRow,
  WorkforceHealthMetrics,
  WorkforceOpsCenterSnapshot,
  WorkforceOpsExecutiveRollup,
  WorkforceOpsQueueItem,
} from "@/lib/workforce-ops-center/types";

const AGING_OPPORTUNITY_DAYS = 14;
const MS_30_DAYS = 30 * MS_PER_DAY;

export type WorkforceOpsBuildContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  coverage: CoverageRiskSnapshot | null;
  fetchedAt: string;
  territoryStates?: string[] | null;
};

function scopedOpportunities(ctx: WorkforceOpsBuildContext): MelOpportunity[] {
  return filterOpportunitiesByTerritory(ctx.opportunities, ctx.territoryStates ?? undefined);
}

function buildMelOpportunityManagement(ctx: WorkforceOpsBuildContext): MelOpportunityManagementSummary {
  const opportunities = scopedOpportunities(ctx);
  const rows: MelOpportunityManagementRow[] = [];

  for (const opportunity of opportunities) {
    let status: MelOpportunityManagementRow["status"] = "open";
    if (!opportunity.openStatus) {
      status = "filled";
    } else if (opportunity.isStaffed) {
      status = "filled";
    } else if (opportunity.priority === "high") {
      status = "coverage-gap";
    }

    const agingDays = opportunity.openStatus && !opportunity.isStaffed ? AGING_OPPORTUNITY_DAYS : null;
    if (agingDays !== null && agingDays >= AGING_OPPORTUNITY_DAYS && status === "open") {
      status = "aging";
    }

    const gap = ctx.coverage?.opportunities.find(
      (row) => row.opportunityId === opportunity.opportunityId && row.staffingRisk === "RED",
    );
    if (gap && status === "open") status = "coverage-gap";

    rows.push({
      opportunityId: opportunity.opportunityId,
      projectName: opportunity.projectName,
      client: opportunity.client,
      storeName: opportunity.storeName,
      city: opportunity.city,
      state: opportunity.state,
      territoryOwner: opportunity.territoryOwner,
      priority: opportunity.priority,
      status,
      isStaffed: opportunity.isStaffed,
      openStatus: opportunity.openStatus,
      agingDays,
      completionPercent: opportunity.isStaffed || !opportunity.openStatus ? 100 : opportunity.openStatus ? 35 : 100,
    });
  }

  const openRows = rows.filter((row) => row.openStatus && !row.isStaffed);
  const filled = rows.filter((row) => row.status === "filled").length;
  const aging = rows.filter((row) => row.status === "aging").length;
  const coverageGaps = rows.filter((row) => row.status === "coverage-gap").length;
  const completionRatePercent =
    rows.length > 0 ? Math.round((filled / rows.length) * 100) : 100;

  return {
    openByTerritory: openRows.length,
    filled,
    aging,
    coverageGaps,
    completionRatePercent,
    rows: rows.sort((a, b) => {
      const rank = { "coverage-gap": 0, aging: 1, open: 2, filled: 3 };
      return rank[a.status] - rank[b.status] || a.state.localeCompare(b.state);
    }),
  };
}

function buildMelPipeline(ctx: WorkforceOpsBuildContext): MelPipelineItem[] {
  if (!ctx.workflows) return [];
  const referenceMs = Date.parse(ctx.fetchedAt);
  const openOpportunities = scopedOpportunities(ctx).filter((row) => row.openStatus);
  const items: MelPipelineItem[] = [];

  for (const candidate of ctx.candidates) {
    const workflow = ctx.workflows[candidate.candidateId];
    const row = buildBaselineWorkflowRow(candidate, workflow);
    const melStatuses = new Set([
      "Signed",
      "Awaiting DD Verification",
      "Ready for MEL",
      "Loaded in MEL",
      "Training Needed",
    ]);
    if (!melStatuses.has(row.workflowStatus) && !isMelReadyStatus(row.workflowStatus)) continue;

    const readiness = assessMelIntegrationReadiness(
      candidate,
      workflow,
      openOpportunities,
      referenceMs,
    );
    const applied = parseDate(candidate.appliedDate);
    const daysInPipeline =
      applied && !Number.isNaN(referenceMs)
        ? Math.max(0, Math.round((referenceMs - applied.getTime()) / MS_PER_DAY))
        : null;

    items.push({
      candidateId: candidate.candidateId,
      candidateName: `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email,
      recruiterName: row.assignedRecruiter || "Unassigned",
      dmName: row.assignedDM || "Unassigned",
      state: candidate.state,
      city: candidate.city,
      workflowStatus: row.workflowStatus,
      pipelineStatus: readiness.pipelineStatus,
      melReady: readiness.melReady,
      assignmentStatus: readiness.topOpportunityId ? "matched" : "unassigned",
      completionStatus:
        row.workflowStatus === "Loaded in MEL" || row.workflowStatus === "Active Rep"
          ? "complete"
          : row.workflowStatus === "Ready for MEL"
            ? "in-progress"
            : "pending",
      topOpportunityId: readiness.topOpportunityId,
      topProjectName: readiness.topProjectName,
      fitPercent: readiness.fitPercent,
      daysInPipeline,
    });
  }

  return items.sort(
    (a, b) =>
      (a.pipelineStatus === "stalled" ? 0 : 1) - (b.pipelineStatus === "stalled" ? 0 : 1) ||
      (b.fitPercent ?? 0) - (a.fitPercent ?? 0),
  );
}

function buildWorkforceHealth(ctx: WorkforceOpsBuildContext): WorkforceHealthMetrics {
  const opportunities = scopedOpportunities(ctx);
  const openCalls = opportunities.filter((row) => row.openStatus && !row.isStaffed).length;
  const filledCalls = opportunities.filter((row) => row.isStaffed || !row.openStatus).length;

  const activeReps = ctx.activeReps.filter((rep) => rep.active);
  const referenceMs = Date.parse(ctx.fetchedAt);
  const newReps30Days = activeReps.filter((rep) => {
    if (!rep.dateOfHire) return false;
    const hired = Date.parse(rep.dateOfHire);
    return !Number.isNaN(hired) && referenceMs - hired <= MS_30_DAYS;
  }).length;
  const inactiveReps = ctx.activeReps.filter((rep) => !rep.active).length;

  const assignedLoad = activeReps.reduce((sum, rep) => sum + rep.openAssignments, 0);
  const repUtilizationPercent =
    activeReps.length > 0
      ? Math.min(100, Math.round((assignedLoad / (activeReps.length * 4)) * 100))
      : 0;

  const center = buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  });
  const avgCoverage =
    center.territories.length > 0
      ? Math.round(
          center.territories.reduce((sum, row) => sum + row.metrics.coveragePercent, 0) /
            center.territories.length,
        )
      : 0;
  const atRiskTerritories = center.executiveRollup.highestRiskTerritories.length;

  return {
    openCalls,
    filledCalls,
    coveragePercent: avgCoverage,
    repUtilizationPercent,
    activeReps: activeReps.length,
    newReps30Days,
    inactiveReps,
    atRiskTerritories,
  };
}

function buildExecutiveRollup(ctx: WorkforceOpsBuildContext): WorkforceOpsExecutiveRollup {
  const hired = ctx.candidates.filter((c) => isHiredStage(c.stage)).length;
  const readyForMel = countWorkflowReadyForMel(ctx.workflows);
  const loaded = ctx.workflows
    ? Object.values(ctx.workflows).filter((w) => w.workflowStatus === "Loaded in MEL").length
    : 0;

  const recruitingToMelConversionPercent =
    hired > 0 ? Math.round((loaded / hired) * 100) : readyForMel > 0 ? 50 : 0;

  const hireDurations: number[] = [];
  for (const candidate of ctx.candidates) {
    if (!isHiredStage(candidate.stage)) continue;
    const applied = parseDate(candidate.appliedDate);
    const updated = parseDate(candidate.updatedDate) ?? applied;
    if (!applied || !updated) continue;
    hireDurations.push(Math.max(0, Math.round((updated.getTime() - applied.getTime()) / MS_PER_DAY)));
  }
  const avgTimeToFillDays =
    hireDurations.length > 0
      ? Math.round(hireDurations.reduce((sum, days) => sum + days, 0) / hireDurations.length)
      : null;

  const opportunities = scopedOpportunities(ctx);
  const territoryFillRates = DISTRICT_MANAGERS.map((dmName) => {
    const states = new Set(getAssignedStatesForDm(dmName).map(normalizeStateCode));
    const scoped = opportunities.filter((row) => states.has(normalizeStateCode(row.state)));
    const open = scoped.filter((row) => row.openStatus && !row.isStaffed).length;
    const filled = scoped.filter((row) => row.isStaffed || !row.openStatus).length;
    const total = open + filled;
    return {
      dmName,
      fillRatePercent: total > 0 ? Math.round((filled / total) * 100) : 100,
      openCalls: open,
      filledCalls: filled,
    };
  }).sort((a, b) => a.fillRatePercent - b.fillRatePercent);

  const health = buildWorkforceHealth(ctx);
  const workforceCapacityScore = Math.round(
    (health.coveragePercent * 0.4 +
      (100 - health.repUtilizationPercent) * 0.2 +
      territoryFillRates.reduce((sum, row) => sum + row.fillRatePercent, 0) /
        Math.max(1, territoryFillRates.length) *
        0.4),
  );

  const repActivationTrend = [
    { label: "Prior month", activeReps: Math.max(0, health.activeReps - health.newReps30Days), newReps: 0 },
    { label: "Last 30 days", activeReps: health.activeReps, newReps: health.newReps30Days },
  ];

  return {
    recruitingToMelConversionPercent,
    avgTimeToFillDays,
    territoryFillRates: territoryFillRates.slice(0, 10),
    workforceCapacityScore: Math.max(0, Math.min(100, workforceCapacityScore)),
    repActivationTrend,
  };
}

function buildOperationsQueue(ctx: WorkforceOpsBuildContext): WorkforceOpsQueueItem[] {
  const queue: WorkforceOpsQueueItem[] = [];
  const pipeline = buildMelPipeline(ctx);
  const melMgmt = buildMelOpportunityManagement(ctx);

  for (const item of pipeline.filter((row) => row.assignmentStatus === "unassigned" && row.melReady)) {
    queue.push({
      id: `assign:${item.candidateId}`,
      category: "needs-assignment",
      severity: "high",
      title: "Needs MEL assignment",
      detail: `${item.candidateName} ready for MEL with no matched project`,
      state: item.state,
      candidateId: item.candidateId,
    });
  }

  if (ctx.workflows) {
    for (const candidate of ctx.candidates) {
      const workflow = ctx.workflows[candidate.candidateId];
      const row = buildBaselineWorkflowRow(candidate, workflow);
      if (
        row.workflowStatus === "Qualified" ||
        row.workflowStatus === "Paperwork Needed" ||
        isPaperworkPendingStatus(row.workflowStatus)
      ) {
        queue.push({
          id: `paperwork:${candidate.candidateId}`,
          category: "missing-paperwork",
          severity: "medium",
          title: "Missing paperwork",
          detail: `${row.firstName} ${row.lastName} — ${row.workflowStatus}`,
          state: candidate.state,
          candidateId: candidate.candidateId,
        });
      }
    }
  }

  for (const row of melMgmt.rows.filter((item) => item.status === "coverage-gap").slice(0, 8)) {
    queue.push({
      id: `gap:${row.opportunityId}`,
      category: "coverage-gap",
      severity: row.priority === "high" ? "critical" : "high",
      title: "Coverage gap",
      detail: `${row.projectName} · ${row.city}, ${row.state}`,
      dmName: row.territoryOwner as DistrictManager,
      state: row.state,
      opportunityId: row.opportunityId,
    });
  }

  for (const row of melMgmt.rows.filter((item) => item.status === "aging").slice(0, 6)) {
    queue.push({
      id: `stalled:${row.opportunityId}`,
      category: "stalled-opportunity",
      severity: "medium",
      title: "Stalled opportunity",
      detail: `${row.projectName} open without staffing`,
      dmName: row.territoryOwner as DistrictManager,
      state: row.state,
      opportunityId: row.opportunityId,
    });
  }

  for (const territory of buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  }).territories.filter((row) => row.metrics.coveragePercent < 50)) {
    queue.push({
      id: `territory:${territory.dmName}`,
      category: "unassigned-territory",
      severity: "high",
      title: "At-risk territory",
      detail: `${territory.dmName} coverage ${territory.metrics.coveragePercent}%`,
      dmName: territory.dmName,
    });
  }

  const severityRank = { critical: 0, high: 1, medium: 2 };
  return queue.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).slice(0, 24);
}

function buildTerritoryDrilldowns(ctx: WorkforceOpsBuildContext): TerritoryDrilldownRow[] {
  const center = buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  });

  return center.territories.map((territory) => {
    const dmCandidates = ctx.candidates.filter((candidate) =>
      territory.states.includes(normalizeStateCode(candidate.state)),
    );
    const progressed = dmCandidates.filter((candidate) => {
      const stage = candidate.stage.toLowerCase();
      return !stage.includes("applied") && !stage.includes("new");
    }).length;
    const recruiterPerformanceScore =
      dmCandidates.length > 0 ? Math.round((progressed / dmCandidates.length) * 100) : 0;

    return {
      dmName: territory.dmName,
      states: territory.states,
      recruiterPerformanceScore,
      dmPerformanceScore: territory.metrics.coveragePercent,
      melOpportunityScore: Math.max(0, 100 - territory.metrics.coverageRiskScore),
      workforceHealthScore: territory.metrics.coveragePercent,
      openCalls: territory.metrics.openCalls,
      readyForMel: dmCandidates.filter((candidate) => {
        const workflow = ctx.workflows?.[candidate.candidateId];
        return workflow ? isMelReadyStatus(workflow.workflowStatus) : false;
      }).length,
      activeReps: territory.metrics.activeReps,
    };
  });
}

export function buildWorkforceOpsCenterSnapshot(
  ctx: WorkforceOpsBuildContext,
): WorkforceOpsCenterSnapshot {
  return {
    fetchedAt: ctx.fetchedAt,
    melOpportunities: buildMelOpportunityManagement(ctx),
    melPipeline: buildMelPipeline(ctx),
    workforceHealth: buildWorkforceHealth(ctx),
    executiveRollup: buildExecutiveRollup(ctx),
    operationsQueue: buildOperationsQueue(ctx),
    territoryDrilldowns: buildTerritoryDrilldowns(ctx),
  };
}
