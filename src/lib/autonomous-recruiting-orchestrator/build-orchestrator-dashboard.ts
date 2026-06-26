import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildAutonomousOnboardingDashboardSnapshot } from "@/lib/autonomous-onboarding-engine/build-autonomous-onboarding-dashboard";
import { buildAutonomousPaperworkDashboard } from "@/lib/autonomous-paperwork-engine/build-autonomous-paperwork-dashboard";
import { buildAutonomousCandidateCommunicationDashboard } from "@/lib/autonomous-candidate-communication-engine/build-communication-dashboard";
import { buildCommunicationDecisionsForCandidate } from "@/lib/autonomous-candidate-communication-engine/build-communication-decisions";
import { buildExecutiveDailyBrief } from "@/lib/executive-daily-brief/build-executive-daily-brief";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildAutomationReadinessScore } from "@/lib/autonomous-recruiting-orchestrator/build-automation-readiness-score";
import { buildCandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/build-candidate-orchestration";
import { buildCrossEngineHealth } from "@/lib/autonomous-recruiting-orchestrator/build-cross-engine-health";
import { buildCandidateOrchestrationTimeline } from "@/lib/autonomous-recruiting-orchestrator/build-orchestrator-timeline";
import {
  canExecuteOrchestrator,
  isPreviewOrchestrator,
} from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import type {
  CandidateOrchestrationPreviewSnapshot,
  OrchestratorDashboardSnapshot,
  OrchestratorStageBucket,
  OrchestratorWorkflowStage,
  P74FeatureFlags,
} from "@/lib/autonomous-recruiting-orchestrator/types";
import { P74_PREVIEW_MODE, P74_SOURCE_PHASE } from "@/lib/autonomous-recruiting-orchestrator/types";

const LIFECYCLE_FLOW = [
  "Coverage Need",
  "Recruiting Intelligence",
  "Candidate applies",
  "Candidate Intelligence",
  "Paperwork Engine",
  "Communication Engine",
  "Onboarding Engine",
  "Ready for Work",
  "Executive Daily Brief",
  "Workflow Complete",
];

const STAGE_LABELS: Record<OrchestratorWorkflowStage, string> = {
  coverage_need: "Coverage Need",
  applied: "Applied",
  candidate_intelligence: "Candidate Intelligence",
  recruiter_approval: "Recruiter Approval",
  paperwork: "Paperwork",
  communication: "Communication",
  onboarding: "Onboarding",
  ready_for_work: "Ready for Work",
  workflow_complete: "Complete",
  blocked: "Blocked",
};

function buildControls(flags: P74FeatureFlags) {
  return {
    orchestratorEnabled: flags.orchestratorEnabled,
    executionMode: flags.executionMode,
    previewMode: flags.previewMode,
    canExecute: canExecuteOrchestrator(flags),
    previewOnly: isPreviewOrchestrator(flags),
  };
}

function bucketByStage(orchestrations: ReturnType<typeof buildCandidateOrchestrationSnapshot>[]): OrchestratorStageBucket[] {
  const buckets = new Map<OrchestratorWorkflowStage, string[]>();
  for (const row of orchestrations) {
    const list = buckets.get(row.workflowStage) ?? [];
    list.push(row.candidateId);
    buckets.set(row.workflowStage, list);
  }

  return Object.entries(STAGE_LABELS).map(([stage, label]) => ({
    stage: stage as OrchestratorWorkflowStage,
    label,
    count: buckets.get(stage as OrchestratorWorkflowStage)?.length ?? 0,
    candidateIds: buckets.get(stage as OrchestratorWorkflowStage) ?? [],
  }));
}

export function buildAutonomousRecruitingOrchestratorDashboard(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
}): OrchestratorDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const paperwork = buildAutonomousPaperworkDashboard({
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    fetchedAt,
  });

  const onboarding = buildAutonomousOnboardingDashboardSnapshot({
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    fetchedAt,
  });

  const communication = buildAutonomousCandidateCommunicationDashboard({
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.p73Flags,
    fetchedAt,
  });

  const brief = buildExecutiveDailyBrief({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.p71Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
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

  const engineHealth = buildCrossEngineHealth({
    paperwork,
    onboarding,
    communication,
    brief,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    orchestratorEnabled: input.p74Flags.orchestratorEnabled,
  });

  const readinessScore = buildAutomationReadinessScore({
    paperwork,
    onboarding,
    communication,
    orchestrations,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
  });

  const waitingHumanAction = orchestrations
    .filter((o) => o.workflowStage === "recruiter_approval" || o.blockers.length > 0)
    .slice(0, 15);

  const readyForAutomation = orchestrations.filter((o) => o.automationEligible).slice(0, 15);
  const blockedCandidates = orchestrations.filter((o) => o.workflowStage === "blocked" || o.riskLevel === "critical").slice(0, 15);

  const sampleRow =
    input.workflowRows.find((r) => r.paperworkSentAt) ?? input.workflowRows[0] ?? null;
  const sampleDecisions = sampleRow
    ? buildCommunicationDecisionsForCandidate({
        row: sampleRow,
        onboarding: onboardingByCandidate.get(sampleRow.candidateId) ?? null,
        policy: input.policy,
        flags: input.p73Flags,
        referenceMs,
        fetchedAt,
      })
    : [];

  const sampleTimeline = sampleRow
    ? buildCandidateOrchestrationTimeline({
        row: sampleRow,
        onboarding: onboardingByCandidate.get(sampleRow.candidateId) ?? null,
        communicationDecisions: sampleDecisions,
        executionMode: input.p74Flags.executionMode,
      })
    : [];

  const recentActivity = sampleTimeline.slice(-8).reverse();

  const upcomingAutomations = readyForAutomation.slice(0, 10).map((o) => ({
    candidateId: o.candidateId,
    candidateName: o.candidateName,
    engine: o.responsibleEngine,
    action: o.nextAction,
    scheduledAt: o.estimatedCompletionAt,
  }));

  const healthy = orchestrations.filter((o) => o.riskLevel === "low" && o.blockers.length === 0).length;
  const warning = orchestrations.filter((o) => o.riskLevel === "medium").length;
  const blocked = orchestrations.filter((o) => o.riskLevel === "high" || o.riskLevel === "critical").length;

  const automated = orchestrations.filter((o) => o.automationEligible).length;
  const manual = orchestrations.length - automated;

  const workflowDurations = input.workflowRows
    .filter((r) => r.appliedDate && r.paperworkSignedAt)
    .map((r) => (Date.parse(r.paperworkSignedAt!) - Date.parse(r.appliedDate!)) / (60 * 60 * 1000));

  const averageWorkflowTimeHours =
    workflowDurations.length > 0
      ? Math.round(workflowDurations.reduce((a, b) => a + b, 0) / workflowDurations.length)
      : null;

  const warnings = [
    "Preview mode — orchestrator coordinates P67–P73 engines without production execution.",
    "No emails, SMS, Dropbox Sign, production writes, or candidate mutations.",
    "P74 orchestrator execution remains disabled unless production flags are explicitly enabled.",
  ];

  if (!input.p74Flags.orchestratorEnabled) {
    warnings.push("Orchestrator is OFF — recommendations computed for preview only.");
  }

  return {
    sourcePhase: P74_SOURCE_PHASE,
    previewMode: P74_PREVIEW_MODE,
    fetchedAt,
    controls: buildControls(input.p74Flags),
    lifecycleFlow: LIFECYCLE_FLOW,
    workflowHealth: { healthy, warning, blocked, total: orchestrations.length },
    candidatesByStage: bucketByStage(orchestrations),
    automationProgress: {
      automated,
      manual,
      percent: orchestrations.length > 0 ? Math.round((automated / orchestrations.length) * 100) : null,
    },
    waitingHumanAction,
    readyForAutomation,
    blockedCandidates,
    recentActivity,
    upcomingAutomations,
    engineHealth,
    readinessScore,
    executiveMetrics: {
      candidatesEnteringWorkflow: input.candidates.filter((c) => {
        const d = new Date(c.appliedDate ?? "");
        const ref = new Date(fetchedAt);
        return d.toDateString() === ref.toDateString();
      }).length,
      workflowCompletions: orchestrations.filter((o) => o.workflowStage === "workflow_complete").length,
      averageWorkflowTimeHours,
      candidatesAwaitingAction: waitingHumanAction.length,
      automationCompletionPercent: readinessScore.overall,
      recruiterTimeSaved:
        communication.health.recruiterWorkEliminated + paperwork.executiveMetrics.todaysSends,
      blockedWorkflows: blockedCandidates.length,
      healthyWorkflows: healthy,
      readyForExecution: readyForAutomation.length,
    },
    sampleTimeline,
    warnings,
  };
}

export function buildCandidateOrchestrationPreview(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  fetchedAt?: string;
}): CandidateOrchestrationPreviewSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const orchestration = buildCandidateOrchestrationSnapshot({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
    referenceMs,
  });

  const communicationDecisions = buildCommunicationDecisionsForCandidate({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
    flags: input.p73Flags,
    referenceMs,
    fetchedAt,
  });

  const timeline = buildCandidateOrchestrationTimeline({
    row: input.row,
    onboarding: input.onboarding,
    communicationDecisions,
    executionMode: input.p74Flags.executionMode,
  });

  return {
    candidateId: input.row.candidateId,
    candidateName: orchestration.candidateName,
    orchestration,
    timeline,
  };
}
