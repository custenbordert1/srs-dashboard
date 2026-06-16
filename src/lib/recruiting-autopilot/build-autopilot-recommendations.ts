import type { BreezyJob } from "@/lib/breezy-api";
import { AUTOPILOT_RECOMMENDATION_LABELS } from "@/lib/recruiting-autopilot/recommendation-labels";
import { computeAutopilotOpportunityScore } from "@/lib/recruiting-autopilot/opportunity-scoring";
import { computePrioritizationScore } from "@/lib/recruiting-autopilot/prioritize-recommendations";
import type {
  AutopilotEntityType,
  AutopilotHorizon,
  AutopilotNavigation,
  AutopilotRecommendation,
  AutopilotRecommendationKind,
} from "@/lib/recruiting-autopilot/types";
import type { PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";
import type { RecruiterWorkloadRow } from "@/lib/territory-action-engine/types";
import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import { candidatesForJob } from "@/lib/dm-dashboard/territory-shared";
import type { BreezyCandidate } from "@/lib/breezy-api";

function nav(tabId: DashboardTabId, label: string, elementId?: string): AutopilotNavigation {
  return { tabId, elementId, label };
}

function confidenceFromRisk(riskScore: number, factorBoost = 0): number {
  return Math.min(95, Math.max(35, Math.round(riskScore * 0.65 + 20 + factorBoost)));
}

function impactFromRisk(riskScore: number, boost = 0): number {
  return Math.min(100, Math.max(20, Math.round(riskScore * 0.85 + boost)));
}

function horizonForKind(kind: AutopilotRecommendationKind, riskScore: number): AutopilotHorizon {
  if (
    kind === "increase-follow-up-frequency" ||
    kind === "reopen-previous-candidates" ||
    kind === "refresh-job-posting" ||
    (kind === "escalate-to-dm" && riskScore >= 70)
  ) {
    return "quick-win";
  }
  if (kind === "launch-territory-blitz" || kind === "adjust-pay-rate") return "long-term";
  return riskScore >= 65 ? "quick-win" : "long-term";
}

function buildRecommendation(input: {
  id: string;
  kind: AutopilotRecommendationKind;
  entityType: AutopilotEntityType;
  entityId: string;
  entityLabel: string;
  dmName?: string;
  riskScore: number;
  openCalls: number;
  coveragePercent: number;
  pipelineDepth: number;
  hiringVelocityRisk: number;
  deadlinePressure: number;
  reasoning: string;
  supportingMetrics: AutopilotRecommendation["supportingMetrics"];
  navigation: AutopilotNavigation;
  confidenceBoost?: number;
  impactBoost?: number;
}): AutopilotRecommendation {
  const impactScore = impactFromRisk(input.riskScore, input.impactBoost ?? 0);
  const confidenceScore = confidenceFromRisk(input.riskScore, input.confidenceBoost ?? 0);
  const opportunity = computeAutopilotOpportunityScore({
    currentRisk: input.riskScore,
    impactScore,
    confidenceScore,
    openCalls: input.openCalls,
    pipelineDepth: input.pipelineDepth,
    coveragePercent: input.coveragePercent,
    hiringVelocityRisk: input.hiringVelocityRisk,
    deadlinePressure: input.deadlinePressure,
  });
  const prioritizationScore = computePrioritizationScore({
    impactScore,
    confidenceScore,
    currentRisk: input.riskScore,
    estimatedCoverageGain: opportunity.estimatedCoverageGain,
    estimatedCandidateGain: opportunity.estimatedCandidateGain,
    hiringVelocityRisk: input.hiringVelocityRisk,
    deadlinePressure: input.deadlinePressure,
    kind: input.kind,
  });

  return {
    id: input.id,
    kind: input.kind,
    title: AUTOPILOT_RECOMMENDATION_LABELS[input.kind],
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    dmName: input.dmName,
    impactScore,
    confidenceScore,
    estimatedOutcomeImprovement: opportunity.potentialImprovement,
    reasoning: input.reasoning,
    supportingMetrics: input.supportingMetrics,
    opportunity,
    prioritizationScore,
    horizon: horizonForKind(input.kind, input.riskScore),
    navigation: input.navigation,
  };
}

export function buildTerritoryAutopilotRecommendations(
  rows: PredictiveTerritoryRiskRow[],
): AutopilotRecommendation[] {
  const recommendations: AutopilotRecommendation[] = [];

  for (const row of rows) {
    const factors = row.factors;
    const base = {
      entityId: row.entityId,
      entityLabel: row.label,
      dmName: row.dmName,
      riskScore: row.riskScore,
      openCalls: row.openCalls,
      coveragePercent: row.coveragePercent,
      pipelineDepth: row.pipelineDepth,
      hiringVelocityRisk: factors.hiringVelocityRisk,
      deadlinePressure: factors.deadlinePressure,
    };

    if (factors.applicationVelocityRisk >= 55 || row.pipelineDepth === 0) {
      recommendations.push(
        buildRecommendation({
          ...base,
          id: `autopilot:${row.entityId}:increase-ad-spend`,
          kind: "increase-ad-spend",
          entityType: row.entityType === "dm" ? "dm" : "territory",
          reasoning: "Application velocity is lagging open call demand in this territory.",
          supportingMetrics: [
            { label: "Open calls", value: String(row.openCalls) },
            { label: "Pipeline depth", value: String(row.pipelineDepth) },
            { label: "Velocity risk", value: `${factors.applicationVelocityRisk}` },
          ],
          navigation: nav("candidates", "Open Candidates Center", "recruiter-action-queue"),
          impactBoost: 6,
        }),
      );
    }

    if (factors.pipelineDepthRisk >= 50) {
      recommendations.push(
        buildRecommendation({
          ...base,
          id: `autopilot:${row.entityId}:outreach-campaign`,
          kind: "create-candidate-outreach-campaign",
          entityType: row.entityType === "dm" ? "dm" : "territory",
          reasoning: "Shallow pipeline needs proactive candidate outreach to protect coverage.",
          supportingMetrics: [
            { label: "Pipeline depth", value: String(row.pipelineDepth) },
            { label: "Coverage", value: `${row.coveragePercent}%` },
            { label: "Alerts", value: String(row.alertCount) },
          ],
          navigation: nav("candidates", "Open Candidates Center"),
        }),
      );
    }

    if (factors.coverageGapRisk >= 55 || factors.deadlinePressure >= 50) {
      recommendations.push(
        buildRecommendation({
          ...base,
          id: `autopilot:${row.entityId}:expand-radius`,
          kind: "expand-recruiting-radius",
          entityType: row.entityType === "store-cluster" ? "store-cluster" : "territory",
          reasoning: "Coverage gap and deadline pressure require a wider recruiting radius.",
          supportingMetrics: [
            { label: "Coverage gap risk", value: `${factors.coverageGapRisk}` },
            { label: "Deadline pressure", value: `${factors.deadlinePressure}` },
            { label: "Coverage", value: `${row.coveragePercent}%` },
          ],
          navigation: nav("placement-command-center", "Open Placement Command Center", "placement-store-coverage"),
        }),
      );
    }

    if (factors.followUpBacklogRisk >= 45 || row.followUpCount > 0) {
      recommendations.push(
        buildRecommendation({
          ...base,
          id: `autopilot:${row.entityId}:follow-up-frequency`,
          kind: "increase-follow-up-frequency",
          entityType: "dm",
          reasoning: "Follow-up backlog is limiting conversion from active alerts.",
          supportingMetrics: [
            { label: "Follow-ups", value: String(row.followUpCount) },
            { label: "Follow-up risk", value: `${factors.followUpBacklogRisk}` },
            { label: "Alerts", value: String(row.alertCount) },
          ],
          navigation: nav("executive-alerts", "Open Executive Alerts", "executive-alert-center"),
        }),
      );
    }

    if (row.riskScore >= 70) {
      recommendations.push(
        buildRecommendation({
          ...base,
          id: `autopilot:${row.entityId}:territory-blitz`,
          kind: "launch-territory-blitz",
          entityType: "territory",
          reasoning: "Multiple risk factors justify a coordinated territory recruiting blitz.",
          supportingMetrics: [
            { label: "Risk score", value: String(row.riskScore) },
            { label: "Trend", value: row.trend },
            { label: "Open calls", value: String(row.openCalls) },
          ],
          navigation: nav("predictive-territory-risk", "Open Territory Risk Dashboard", "predictive-territory-risk-dashboard"),
          confidenceBoost: 8,
        }),
      );
    }

    if (factors.coverageGapRisk >= 60 || factors.alertVolumeRisk >= 50) {
      recommendations.push(
        buildRecommendation({
          ...base,
          id: `autopilot:${row.entityId}:escalate-dm`,
          kind: "escalate-to-dm",
          entityType: "dm",
          reasoning: `${row.dmName} is forecast to miss coverage targets without executive escalation.`,
          supportingMetrics: [
            { label: "Coverage", value: `${row.coveragePercent}%` },
            { label: "Alert volume", value: String(row.alertCount) },
            { label: "Risk score", value: String(row.riskScore) },
          ],
          navigation: nav("dm-scorecards", "Open DM Scorecards"),
        }),
      );
    }

    if (factors.hiringVelocityRisk >= 60) {
      recommendations.push(
        buildRecommendation({
          ...base,
          id: `autopilot:${row.entityId}:adjust-pay`,
          kind: "adjust-pay-rate",
          entityType: "territory",
          reasoning: "Hiring velocity is too slow relative to open store demand.",
          supportingMetrics: [
            { label: "Hiring velocity risk", value: `${factors.hiringVelocityRisk}` },
            { label: "Open calls", value: String(row.openCalls) },
            { label: "Hires signal", value: `${100 - factors.hiringVelocityRisk}%` },
          ],
          navigation: nav("job-management", "Open Job Management"),
        }),
      );
    }
  }

  return recommendations;
}

export function buildProjectAutopilotRecommendations(
  rows: PredictiveTerritoryRiskRow[],
): AutopilotRecommendation[] {
  return rows
    .filter((row) => row.riskScore >= 45)
    .map((row) =>
      buildRecommendation({
        id: `autopilot:${row.entityId}:refresh-job`,
        kind: "refresh-job-posting",
        entityType: "project",
        entityId: row.entityId,
        entityLabel: row.label,
        dmName: row.dmName,
        riskScore: row.riskScore,
        openCalls: row.openCalls,
        coveragePercent: row.coveragePercent,
        pipelineDepth: row.pipelineDepth,
        hiringVelocityRisk: row.factors.hiringVelocityRisk,
        deadlinePressure: row.factors.deadlinePressure,
        reasoning: "Project forecast and pipeline depth indicate posting refresh will improve applicant flow.",
        supportingMetrics: [
          { label: "Project risk", value: String(row.riskScore) },
          { label: "Pipeline", value: String(row.pipelineDepth) },
          { label: "Coverage", value: `${row.coveragePercent}%` },
        ],
        navigation: nav("placement-command-center", "Open Project Forecasts", "placement-project-forecasts"),
      }),
    );
}

export function buildStoreClusterAutopilotRecommendations(
  rows: PredictiveTerritoryRiskRow[],
): AutopilotRecommendation[] {
  return rows
    .filter((row) => row.pipelineDepth === 0 && row.openCalls > 0)
    .map((row) =>
      buildRecommendation({
        id: `autopilot:${row.entityId}:reopen-candidates`,
        kind: "reopen-previous-candidates",
        entityType: "store-cluster",
        entityId: row.entityId,
        entityLabel: row.label,
        dmName: row.dmName,
        riskScore: row.riskScore,
        openCalls: row.openCalls,
        coveragePercent: row.coveragePercent,
        pipelineDepth: row.pipelineDepth,
        hiringVelocityRisk: row.factors.hiringVelocityRisk,
        deadlinePressure: row.factors.deadlinePressure,
        reasoning: "Store cluster has open calls with zero pipeline — reopen prior candidates before going zero-pipeline.",
        supportingMetrics: [
          { label: "Open calls", value: String(row.openCalls) },
          { label: "Pipeline", value: "0" },
          { label: "Coverage", value: `${row.coveragePercent}%` },
        ],
        navigation: nav("candidates", "Open Candidates Center"),
        confidenceBoost: 10,
        impactBoost: 8,
      }),
    );
}

export function buildJobPostingAutopilotRecommendations(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
}): AutopilotRecommendation[] {
  const recommendations: AutopilotRecommendation[] = [];

  for (const job of input.jobs) {
    const applicants = candidatesForJob(job, input.candidates);
    if (applicants.length > 1) continue;

    const riskScore = applicants.length === 0 ? 78 : 58;
    recommendations.push(
      buildRecommendation({
        id: `autopilot:job:${job.jobId}:refresh`,
        kind: "refresh-job-posting",
        entityType: "job-posting",
        entityId: job.jobId,
        entityLabel: job.name,
        dmName: undefined,
        riskScore,
        openCalls: 1,
        coveragePercent: applicants.length === 0 ? 20 : 45,
        pipelineDepth: applicants.length,
        hiringVelocityRisk: applicants.length === 0 ? 75 : 50,
        deadlinePressure: 40,
        reasoning:
          applicants.length === 0
            ? "Job posting has zero applicants and needs immediate refresh."
            : "Low applicant flow — refresh posting copy and distribution.",
        supportingMetrics: [
          { label: "Applicants", value: String(applicants.length) },
          { label: "Location", value: `${job.city}, ${job.state}` },
          { label: "Status", value: job.status },
        ],
        navigation: nav("job-management", "Open Job Management"),
      }),
    );
  }

  return recommendations.slice(0, 20);
}

export function buildRecruiterAutopilotRecommendations(
  workloads: RecruiterWorkloadRow[],
): AutopilotRecommendation[] {
  return workloads
    .filter((row) => row.workloadScore >= 65)
    .map((row) =>
      buildRecommendation({
        id: `autopilot:recruiter:${row.recruiterName}:assign`,
        kind: "assign-additional-recruiter",
        entityType: "recruiter",
        entityId: row.recruiterName,
        entityLabel: row.recruiterName,
        riskScore: row.workloadScore,
        openCalls: row.assignedCount,
        coveragePercent: Math.max(20, 100 - row.workloadScore),
        pipelineDepth: row.followUpsDue,
        hiringVelocityRisk: row.workloadScore,
        deadlinePressure: row.paperworkPending,
        reasoning: "Recruiter workload is elevated — redistribute candidates or assign backup recruiter capacity.",
        supportingMetrics: [
          { label: "Assigned candidates", value: String(row.assignedCount) },
          { label: "Follow-ups due", value: String(row.followUpsDue) },
          { label: "Workload score", value: String(row.workloadScore) },
        ],
        navigation: nav("candidates", "Open Candidates Center", "recruiter-action-queue"),
      }),
    );
}
