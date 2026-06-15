import type {
  AlertAction,
  AlertAutomationKind,
  AlertDestination,
  ExecutiveAlert,
} from "@/lib/alerts/alert-types";
import {
  PROJECT_COVERAGE_CRITICAL_MAX,
  PROJECT_COVERAGE_HIGH_MAX,
  projectCoverageSeverity,
  recruiterWorkloadSeverity,
  territoryCoverageSeverity,
} from "@/lib/alerts/alert-rules";
import { computeImpactScore } from "@/lib/alerts/alert-prioritizer";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  buildCandidateSlaSnapshot,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { ExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center/types";
import type { PlacementCommandCenterSnapshot } from "@/lib/placement-command-center/types";
import type { TerritoryActionCenterSnapshot } from "@/lib/territory-action-engine/types";

export type AlertBuildContext = {
  fetchedAt: string;
  coverage: CoverageRiskSnapshot;
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  executive: ExecutiveOperationsCenterSnapshot;
  placement: PlacementCommandCenterSnapshot;
  actionCenter: TerritoryActionCenterSnapshot;
};

function makeAlert(input: {
  id: string;
  title: string;
  description: string;
  severity: ExecutiveAlert["severity"];
  category: ExecutiveAlert["category"];
  recommendedAction: AlertAction;
  destination: AlertDestination;
  automationKind: AlertAutomationKind;
  reason: string;
  createdAt: string;
  businessImpact?: number;
  openCalls?: number;
  coverageRisk?: number;
  forecastGap?: number;
}): ExecutiveAlert {
  const impactScore = computeImpactScore({
    severity: input.severity,
    businessImpact: input.businessImpact,
    openCalls: input.openCalls,
    coverageRisk: input.coverageRisk,
    forecastGap: input.forecastGap,
  });
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    severity: input.severity,
    category: input.category,
    impactScore,
    recommendedAction: input.recommendedAction,
    destination: input.destination,
    automationKind: input.automationKind,
    manualOnly: true,
    createdAt: input.createdAt,
    reason: input.reason,
  };
}

function buildProjectAlerts(ctx: AlertBuildContext): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  for (const row of ctx.coverage.opportunities) {
    const severity = projectCoverageSeverity(row.coverageScore);
    if (!severity) continue;
    alerts.push(
      makeAlert({
        id: `project:coverage:${row.opportunityId}`,
        title: row.projectName,
        description: `${row.client} · ${row.city}, ${row.state} — coverage ${Math.round(row.coverageScore)}%`,
        severity,
        category: "project",
        recommendedAction: severity === "critical" ? "create-job-ad" : "assign-recruiter",
        destination: {
          tabId: "placement-command-center",
          label: "Placement Command Center",
        },
        automationKind: severity === "critical" ? "create-job-ad" : "assign-recruiter",
        reason:
          severity === "critical"
            ? `Coverage under ${PROJECT_COVERAGE_CRITICAL_MAX}% with staffing risk ${row.staffingRisk}`
            : `Coverage under ${PROJECT_COVERAGE_HIGH_MAX}% — elevated project risk`,
        createdAt: ctx.fetchedAt,
        businessImpact: severity === "critical" ? 28 : 18,
        openCalls: 1,
        coverageRisk: Math.max(0, 100 - row.coverageScore) / 5,
      }),
    );
  }

  for (const row of ctx.actionCenter.projectRisks) {
    if (row.riskLevel !== "critical" && row.riskLevel !== "high") continue;
    if (alerts.some((alert) => alert.id === `project:risk:${row.opportunityId}`)) continue;
    alerts.push(
      makeAlert({
        id: `project:risk:${row.opportunityId}`,
        title: row.projectName,
        description: `${row.client} · ${row.location} — ${row.riskReason}`,
        severity: row.riskLevel === "critical" ? "critical" : "high",
        category: "project",
        recommendedAction: "create-job-ad",
        destination: { tabId: "executive-operations-center", label: "Executive Operations Center" },
        automationKind: "create-job-ad",
        reason: row.riskReason,
        createdAt: ctx.fetchedAt,
        businessImpact: row.riskLevel === "critical" ? 26 : 16,
        openCalls: row.openCalls,
        coverageRisk: row.riskLevel === "critical" ? 18 : 10,
      }),
    );
  }

  for (const row of ctx.placement.projectForecasts) {
    if (row.outcome !== "critical" && row.outcome !== "at-risk") continue;
    const severity = row.outcome === "critical" ? "critical" : "high";
    const gap = Math.max(0, row.requiredFillRatePercent - row.currentFillRatePercent);
    alerts.push(
      makeAlert({
        id: `project:forecast:${row.opportunityId}`,
        title: `${row.projectName} forecast`,
        description: `${row.client} — fill ${row.currentFillRatePercent}% vs ${row.requiredFillRatePercent}% required`,
        severity,
        category: "project",
        recommendedAction: "placement-review",
        destination: { tabId: "placement-command-center", label: "Placement Command Center" },
        automationKind: "placement-review",
        reason: row.reason,
        createdAt: ctx.fetchedAt,
        businessImpact: severity === "critical" ? 24 : 14,
        forecastGap: Math.min(10, gap / 5),
        coverageRisk: gap / 4,
      }),
    );
  }

  for (const row of ctx.executive.projectForecasts) {
    if (row.outcome !== "likely-to-miss" && row.outcome !== "at-risk") continue;
    const id = `project:exec-forecast:${row.opportunityId}`;
    if (alerts.some((alert) => alert.id === id)) continue;
    alerts.push(
      makeAlert({
        id,
        title: `${row.projectName} likely to miss`,
        description: row.reason,
        severity: row.outcome === "likely-to-miss" ? "critical" : "high",
        category: "project",
        recommendedAction: "placement-review",
        destination: { tabId: "executive-operations-center", label: "Executive Operations Center" },
        automationKind: "placement-review",
        reason: row.reason,
        createdAt: ctx.fetchedAt,
        businessImpact: row.outcome === "likely-to-miss" ? 22 : 12,
        forecastGap: row.outcome === "likely-to-miss" ? 10 : 6,
      }),
    );
  }

  for (const capacity of ctx.actionCenter.repCapacities) {
    if (capacity.openOpportunities <= capacity.activeReps || capacity.activeReps === 0) continue;
    alerts.push(
      makeAlert({
        id: `project:rep-shortage:${capacity.dmName}`,
        title: `${capacity.dmName} open calls exceed reps`,
        description: `${capacity.openOpportunities} open calls vs ${capacity.activeReps} active reps`,
        severity: "critical",
        category: "project",
        recommendedAction: "assign-recruiter",
        destination: { tabId: "territory-intelligence", label: "Territory Intelligence" },
        automationKind: "assign-recruiter",
        reason: "Open calls exceed available field reps",
        createdAt: ctx.fetchedAt,
        businessImpact: 30,
        openCalls: capacity.openOpportunities,
        coverageRisk: 16,
      }),
    );
  }

  return alerts;
}

function buildTerritoryAlerts(ctx: AlertBuildContext): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  for (const row of ctx.executive.territoryWarRoom) {
    const severity = territoryCoverageSeverity(row.coveragePercent, row.riskScore);
    if (!severity) continue;
    alerts.push(
      makeAlert({
        id: `territory:war-room:${row.dmName}`,
        title: `${row.dmName} territory`,
        description: `Coverage ${Math.round(row.coveragePercent)}% · ${row.states.join(", ")}`,
        severity,
        category: "territory",
        recommendedAction: severity === "critical" ? "territory-escalation" : "notify-dm",
        destination: { tabId: "action-center", label: "Territory Action Engine" },
        automationKind: severity === "critical" ? "territory-escalation" : "notify-dm",
        reason: row.priorityActions[0] ?? "Territory health declining",
        createdAt: ctx.fetchedAt,
        businessImpact: severity === "critical" ? 26 : 16,
        coverageRisk: Math.max(0, 100 - row.coveragePercent) / 4,
        openCalls: row.openCalls,
      }),
    );
  }

  for (const card of ctx.actionCenter.actionBoard) {
    if (card.category !== "critical-territory" && card.category !== "coverage-risk") continue;
    const severity: ExecutiveAlert["severity"] =
      card.impactScore >= 85 ? "critical" : card.impactScore >= 70 ? "high" : "medium";
    alerts.push(
      makeAlert({
        id: `territory:action:${card.id}`,
        title: card.issue,
        description: card.impact,
        severity,
        category: "territory",
        recommendedAction: card.category === "critical-territory" ? "territory-escalation" : "notify-dm",
        destination: { tabId: "action-center", label: "Territory Action Engine" },
        automationKind: card.category === "critical-territory" ? "territory-escalation" : "coverage-review",
        reason: card.suggestedAction,
        createdAt: ctx.fetchedAt,
        businessImpact: Math.round(card.impactScore / 4),
        coverageRisk: card.impactScore >= 80 ? 18 : 10,
      }),
    );
  }

  return alerts;
}

function buildRecruiterAlerts(ctx: AlertBuildContext): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  for (const row of ctx.actionCenter.recruiterWorkloads) {
    const severity = recruiterWorkloadSeverity(row.workloadScore);
    if (!severity) continue;
    alerts.push(
      makeAlert({
        id: `recruiter:workload:${row.recruiterName}`,
        title: `${row.recruiterName} workload`,
        description: `Score ${row.workloadScore} · ${row.assignedCount} assigned · ${row.followUpsDue} follow-ups`,
        severity,
        category: "recruiter",
        recommendedAction: "assign-recruiter",
        destination: { tabId: "candidates", label: "Recruiter Action Center", elementId: "recruiter-action-queue" },
        automationKind: "assign-recruiter",
        reason: row.overloadLevel === "overloaded" ? "Recruiter overload" : "Assignment imbalance",
        createdAt: ctx.fetchedAt,
        businessImpact: severity === "critical" ? 24 : 14,
      }),
    );
  }

  for (const card of ctx.actionCenter.actionBoard) {
    if (
      card.category !== "recruiter-overload" &&
      card.category !== "recruiter-follow-up-risk" &&
      card.category !== "paperwork-aging"
    ) {
      continue;
    }
    const severity: ExecutiveAlert["severity"] =
      card.impactScore >= 85 ? "critical" : card.impactScore >= 70 ? "high" : "medium";
    const action: AlertAction =
      card.category === "paperwork-aging" ? "paperwork-review" : "candidate-followup";
    alerts.push(
      makeAlert({
        id: `recruiter:action:${card.id}`,
        title: card.issue,
        description: card.impact,
        severity,
        category: "recruiter",
        recommendedAction: action,
        destination: { tabId: "candidates", label: "Recruiter Action Center", elementId: "recruiter-action-queue" },
        automationKind: action,
        reason: card.suggestedAction,
        createdAt: ctx.fetchedAt,
        businessImpact: Math.round(card.impactScore / 4),
      }),
    );
  }

  return alerts;
}

function buildPlacementAlerts(ctx: AlertBuildContext): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  for (const row of ctx.placement.storeCoverage) {
    if (row.candidatesInPipeline > 0) continue;
    alerts.push(
      makeAlert({
        id: `placement:zero-pipeline:${row.opportunityId}`,
        title: `${row.store} zero pipeline`,
        description: `${row.client} · ${row.project} — no candidates in pipeline`,
        severity: "critical",
        category: "placement",
        recommendedAction: "placement-review",
        destination: { tabId: "placement-command-center", label: "Placement Command Center" },
        automationKind: "open-call-recovery",
        reason: "Zero-pipeline store with open calls",
        createdAt: ctx.fetchedAt,
        businessImpact: 28,
        openCalls: row.openCalls,
        coverageRisk: Math.max(0, 100 - row.coveragePercent) / 5,
      }),
    );
  }

  for (const row of ctx.placement.openCallRecovery) {
    if (row.severity !== "critical" && row.severity !== "high") continue;
    alerts.push(
      makeAlert({
        id: `placement:recovery:${row.opportunityId}`,
        title: `${row.store} open call`,
        description: `${row.client} · ${row.issue}`,
        severity: row.severity === "critical" ? "critical" : "high",
        category: "placement",
        recommendedAction: "placement-review",
        destination: { tabId: "placement-command-center", label: "Placement Command Center" },
        automationKind: "open-call-recovery",
        reason: row.suggestedAction,
        createdAt: ctx.fetchedAt,
        businessImpact: row.severity === "critical" ? 22 : 12,
        openCalls: 1,
      }),
    );
  }

  const funnel = ctx.placement.funnel;
  for (let index = 1; index < funnel.length; index += 1) {
    const prior = funnel[index - 1]!;
    const stage = funnel[index]!;
    if (prior.count === 0 || stage.dropOffPercent === null) continue;
    if (stage.dropOffPercent < 35) continue;
    alerts.push(
      makeAlert({
        id: `placement:funnel:${stage.id}`,
        title: `${stage.label} funnel drop-off`,
        description: `${stage.dropOffPercent}% drop from ${prior.label} (${prior.count} → ${stage.count})`,
        severity: stage.dropOffPercent >= 50 ? "critical" : "high",
        category: "placement",
        recommendedAction: "placement-review",
        destination: { tabId: "placement-command-center", label: "Placement Command Center" },
        automationKind: "placement-review",
        reason: "Conversion collapse between funnel stages",
        createdAt: ctx.fetchedAt,
        businessImpact: stage.dropOffPercent >= 50 ? 20 : 12,
        forecastGap: Math.min(10, stage.dropOffPercent / 10),
      }),
    );
  }

  return alerts;
}

function buildCandidateAlerts(ctx: AlertBuildContext): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];
  const referenceMs = Date.parse(ctx.fetchedAt);

  for (const candidate of ctx.candidates) {
    const workflow = ctx.workflows[candidate.candidateId];
    const row = buildBaselineWorkflowRow(candidate, workflow);
    const candidateName = `${candidate.firstName} ${candidate.lastName}`.trim() || "Candidate";
    const sla = buildCandidateSlaSnapshot({
      appliedDate: candidate.appliedDate ?? candidate.addedDate ?? ctx.fetchedAt,
      workflowStatus: row.workflowStatus,
      lastActionAt: row.lastActionAt,
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      snoozedUntil: row.snoozedUntil,
      referenceMs,
    });
    if (sla.isSnoozed) continue;

    if (isMelReadyStatus(row.workflowStatus) && sla.paperworkAgingSeverity === "critical") {
      alerts.push(
        makeAlert({
          id: `candidate:mel-ready:${candidate.candidateId}`,
          title: `${candidateName} ready for MEL`,
          description: `${candidate.positionName ?? "Role"} · ${candidate.city ?? ""}, ${candidate.state ?? ""}`,
          severity: "critical",
          category: "candidate",
          recommendedAction: "candidate-followup",
          destination: { tabId: "candidates", label: "Recruiter Action Center", elementId: "recruiter-action-queue" },
          automationKind: "candidate-followup",
          reason: "Ready for MEL aging beyond SLA",
          createdAt: ctx.fetchedAt,
          businessImpact: 22,
        }),
      );
      continue;
    }

    if (isPaperworkPendingStatus(row.workflowStatus) && sla.paperworkAgingSeverity !== "none") {
      alerts.push(
        makeAlert({
          id: `candidate:paperwork:${candidate.candidateId}`,
          title: `${candidateName} paperwork`,
          description: `${row.workflowStatus} · ${candidate.positionName ?? "Role"}`,
          severity: sla.paperworkAgingSeverity === "critical" ? "critical" : "high",
          category: "candidate",
          recommendedAction: "paperwork-review",
          destination: { tabId: "candidates", label: "Recruiter Action Center", elementId: "recruiter-action-queue" },
          automationKind: "paperwork-review",
          reason: "Paperwork aging beyond SLA",
          createdAt: ctx.fetchedAt,
          businessImpact: sla.paperworkAgingSeverity === "critical" ? 20 : 12,
        }),
      );
      continue;
    }

    if (sla.followUpOverdue || sla.appliedAgingSeverity === "critical") {
      alerts.push(
        makeAlert({
          id: `candidate:followup:${candidate.candidateId}`,
          title: `${candidateName} follow-up`,
          description: sla.followUpOverdue ? "Follow-up overdue" : "Interview pending too long",
          severity: "high",
          category: "candidate",
          recommendedAction: "candidate-followup",
          destination: { tabId: "candidates", label: "Recruiter Action Center", elementId: "recruiter-action-queue" },
          automationKind: "candidate-followup",
          reason: sla.followUpOverdue ? "Recruiter follow-up overdue" : "Candidate aging in early stage",
          createdAt: ctx.fetchedAt,
          businessImpact: 14,
        }),
      );
    }
  }

  return alerts.slice(0, 40);
}

function buildCoverageAlerts(ctx: AlertBuildContext): ExecutiveAlert[] {
  const summary = ctx.coverage.executiveSummary;
  const alerts: ExecutiveAlert[] = [];

  if (summary.averageCoverageScore < PROJECT_COVERAGE_CRITICAL_MAX) {
    alerts.push(
      makeAlert({
        id: "coverage:company-critical",
        title: "Company coverage collapse",
        description: `Average coverage ${Math.round(summary.averageCoverageScore)}% across ${summary.totalOpenOpportunities} open calls`,
        severity: "critical",
        category: "coverage",
        recommendedAction: "territory-escalation",
        destination: { tabId: "executive-operations-center", label: "Executive Operations Center" },
        automationKind: "coverage-review",
        reason: "Portfolio coverage under 20%",
        createdAt: ctx.fetchedAt,
        businessImpact: 30,
        coverageRisk: 20,
        openCalls: summary.totalOpenOpportunities,
      }),
    );
  } else if (summary.averageCoverageScore < PROJECT_COVERAGE_HIGH_MAX) {
    alerts.push(
      makeAlert({
        id: "coverage:company-high",
        title: "Company coverage at risk",
        description: `Average coverage ${Math.round(summary.averageCoverageScore)}% · ${summary.highRiskProjectCount} high-risk projects`,
        severity: "high",
        category: "coverage",
        recommendedAction: "notify-dm",
        destination: { tabId: "executive-operations-center", label: "Executive Operations Center" },
        automationKind: "coverage-review",
        reason: "Portfolio coverage under 40%",
        createdAt: ctx.fetchedAt,
        businessImpact: 18,
        coverageRisk: 12,
        openCalls: summary.totalOpenOpportunities,
      }),
    );
  }

  if (summary.zeroNearbyRepProjects > 0) {
    alerts.push(
      makeAlert({
        id: "coverage:zero-nearby-reps",
        title: "Projects with zero nearby reps",
        description: `${summary.zeroNearbyRepProjects} project(s) lack nearby field coverage`,
        severity: "critical",
        category: "coverage",
        recommendedAction: "assign-recruiter",
        destination: { tabId: "workforce", label: "Workforce Operations Center" },
        automationKind: "coverage-review",
        reason: "Coverage collapse — no reps near open calls",
        createdAt: ctx.fetchedAt,
        businessImpact: 26,
        openCalls: summary.zeroNearbyRepProjects,
        coverageRisk: 18,
      }),
    );
  }

  return alerts;
}

export function buildAlerts(ctx: AlertBuildContext): ExecutiveAlert[] {
  const merged = [
    ...buildProjectAlerts(ctx),
    ...buildTerritoryAlerts(ctx),
    ...buildRecruiterAlerts(ctx),
    ...buildPlacementAlerts(ctx),
    ...buildCandidateAlerts(ctx),
    ...buildCoverageAlerts(ctx),
  ];

  const seen = new Set<string>();
  return merged.filter((alert) => {
    if (seen.has(alert.id)) return false;
    seen.add(alert.id);
    return true;
  });
}
