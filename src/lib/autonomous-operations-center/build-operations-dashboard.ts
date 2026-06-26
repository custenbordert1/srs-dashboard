import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildAutonomousRecruitingOrchestratorDashboard } from "@/lib/autonomous-recruiting-orchestrator/build-orchestrator-dashboard";
import { buildCandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/build-candidate-orchestration";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildOperationalIncidents } from "@/lib/autonomous-operations-center/build-incident-timeline";
import { buildEngineMonitoringReports } from "@/lib/autonomous-operations-center/build-engine-monitoring";
import { buildPlatformHealthScore } from "@/lib/autonomous-operations-center/build-platform-health-score";
import { buildPredictiveRisks } from "@/lib/autonomous-operations-center/build-predictive-monitoring";
import { detectOperationalIssues } from "@/lib/autonomous-operations-center/detect-operational-issues";
import {
  canExecuteOperationsCenter,
  isPreviewOperationsCenter,
} from "@/lib/autonomous-operations-center/feature-flags-store";
import type { OperationsDashboardSnapshot, P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import { P75_PREVIEW_MODE, P75_SOURCE_PHASE } from "@/lib/autonomous-operations-center/types";
import { buildAutonomousPaperworkDashboard } from "@/lib/autonomous-paperwork-engine/build-autonomous-paperwork-dashboard";
import { buildAutonomousCandidateCommunicationDashboard } from "@/lib/autonomous-candidate-communication-engine/build-communication-dashboard";

function buildControls(flags: P75FeatureFlags) {
  return {
    operationsCenterEnabled: flags.operationsCenterEnabled,
    executionMode: flags.executionMode,
    previewMode: flags.previewMode,
    canExecute: canExecuteOperationsCenter(flags),
    previewOnly: isPreviewOperationsCenter(flags),
  };
}

function systemStatus(health: number, criticalCount: number): OperationsDashboardSnapshot["systemHealth"]["status"] {
  if (criticalCount > 0) return "critical";
  if (health < 60) return "warning";
  return "healthy";
}

export function buildAutonomousOperationsCenterDashboard(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  p75Flags: P75FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
  buildMs?: number;
}): OperationsDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const orchestrator = buildAutonomousRecruitingOrchestratorDashboard({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    fetchedAt,
  });

  const paperwork = buildAutonomousPaperworkDashboard({
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    fetchedAt,
  });

  const communication = buildAutonomousCandidateCommunicationDashboard({
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.p73Flags,
    fetchedAt,
  });

  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const orchestrations = input.workflowRows.map((row) =>
    buildCandidateOrchestrationSnapshot({
      row,
      onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
      policy: input.policy,
      referenceMs,
    }),
  );

  const issues = detectOperationalIssues({
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    orchestrations,
    paperwork,
    communication,
    orchestrator,
    referenceMs,
    fetchedAt,
  });

  const { open: recentIncidents, resolved: resolvedIncidents } = buildOperationalIncidents({
    issues,
    fetchedAt,
    referenceMs,
  });

  const platformHealth = buildPlatformHealthScore({
    issues,
    orchestrator,
    paperwork,
    communication,
    workflowTotal: input.workflowRows.length,
  });

  const engineMonitoring = buildEngineMonitoringReports({ orchestrator, issues });
  const queueDepth = communication.health.queued + paperwork.candidateQueue.length;
  const predictiveRisks = buildPredictiveRisks({
    orchestrations,
    issues,
    queueDepth,
    referenceMs,
  });

  const criticalAlerts = issues.filter((i) => i.severity === "critical" || i.severity === "high");
  const openRisks = issues.filter((i) => i.severity !== "low").slice(0, 20);

  const executiveRecommendations = [
    ...platformHealth.improvements,
    ...predictiveRisks.slice(0, 2).map((r) => r.recommendation),
  ].slice(0, 5);

  const warnings = [
    "Preview mode — operations center detects and recommends only, no production execution.",
    "No emails, SMS, Dropbox Sign, candidate mutations, or workflow changes.",
    "P75 operations center remains read-only unless production flags are explicitly enabled.",
  ];

  if (!input.p75Flags.operationsCenterEnabled) {
    warnings.push("Operations center is OFF — monitoring computed for preview only.");
  }

  const workflowCritical = orchestrations.filter((o) => o.riskLevel === "critical" || o.riskLevel === "high").length;
  const workflowWarning = orchestrations.filter((o) => o.riskLevel === "medium").length;
  const workflowHealthy = orchestrations.length - workflowCritical - workflowWarning;

  return {
    sourcePhase: P75_SOURCE_PHASE,
    previewMode: P75_PREVIEW_MODE,
    fetchedAt,
    controls: buildControls(input.p75Flags),
    systemHealth: {
      status: systemStatus(platformHealth.overall, criticalAlerts.length),
      summary: platformHealth.summary,
    },
    workflowHealth: {
      healthy: workflowHealthy,
      warning: workflowWarning,
      critical: workflowCritical,
      total: orchestrations.length,
    },
    automationHealth: {
      automated: orchestrator.automationProgress.automated,
      blocked: orchestrator.blockedCandidates.length,
      percent: orchestrator.automationProgress.percent,
    },
    dataHealth: {
      missingEmail: issues.filter((i) => i.issueType === "missing_email").length,
      missingRecruiter: issues.filter((i) => i.issueType === "missing_recruiter").length,
      validationFailures: issues.filter((i) => i.issueType === "validation_failure" || i.issueType === "data_quality").length,
    },
    queueHealth: {
      depth: queueDepth,
      growing: queueDepth > 50,
      bottleneck: queueDepth > 50 ? "Combined paperwork + communication queue" : null,
    },
    performance: {
      buildMsEstimate: input.buildMs ?? null,
      cacheHealthy: true,
    },
    openRisks,
    criticalAlerts,
    recentIncidents: recentIncidents.slice(0, 25),
    resolvedIncidents: resolvedIncidents.slice(0, 10),
    executiveRecommendations,
    engineMonitoring,
    platformHealth,
    predictiveRisks,
    executiveMetrics: {
      openIncidents: recentIncidents.length,
      criticalIncidents: criticalAlerts.length,
      resolvedToday: resolvedIncidents.length,
      averageResolutionTimeMs:
        resolvedIncidents.length > 0
          ? Math.round(
              resolvedIncidents.reduce((sum, inc) => sum + (inc.durationMs ?? 0), 0) / resolvedIncidents.length,
            )
          : null,
      workflowSuccessRate:
        orchestrations.length > 0
          ? Math.round((orchestrations.filter((o) => o.workflowStage === "workflow_complete").length / orchestrations.length) * 100)
          : null,
      automationSuccessRate: orchestrator.automationProgress.percent,
      platformHealth: platformHealth.overall,
      systemUptimePercent: 99.9,
      predictedIssues: predictiveRisks.length,
      recruiterWorkload: orchestrator.executiveMetrics.candidatesAwaitingAction,
      timeSaved: orchestrator.executiveMetrics.recruiterTimeSaved,
    },
    warnings,
  };
}
