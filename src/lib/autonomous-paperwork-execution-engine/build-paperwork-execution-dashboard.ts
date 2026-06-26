import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { loadPaperworkExecutionAuditLog } from "@/lib/autonomous-paperwork-execution-engine/audit-log-store";
import { buildPaperworkExecutionEligibility } from "@/lib/autonomous-paperwork-execution-engine/build-execution-eligibility";
import { buildCandidateExecutionTimeline } from "@/lib/autonomous-paperwork-execution-engine/build-candidate-timeline";
import { buildPaperworkExecutionExecutiveMetrics } from "@/lib/autonomous-paperwork-execution-engine/build-executive-execution-metrics";
import { buildPaperworkExecutionQueue } from "@/lib/autonomous-paperwork-execution-engine/build-execution-queue";
import {
  buildPilotSummary,
} from "@/lib/autonomous-paperwork-execution-engine/pilot-filters";
import {
  canExecutePaperwork,
  isPreviewExecution,
} from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import type {
  AutonomousPaperworkExecutionDashboardSnapshot,
  P71FeatureFlags,
  PaperworkExecutionAutomationControls,
} from "@/lib/autonomous-paperwork-execution-engine/types";
import { P71_SOURCE_PHASE } from "@/lib/autonomous-paperwork-execution-engine/types";
import { simulateExecutionWorkflow } from "@/lib/autonomous-paperwork-execution-engine/simulate-execution-workflow";
import { ONBOARDING_TEMPLATE_REGISTRY } from "@/lib/onboarding-template-registry";

function buildControls(flags: P71FeatureFlags): PaperworkExecutionAutomationControls {
  return {
    automationEnabled: flags.automationEnabled,
    executionMode: flags.executionMode,
    dropboxExecution: flags.dropboxExecution,
    pilotSummary: buildPilotSummary(flags),
    canExecute: canExecutePaperwork(flags),
    previewOnly: isPreviewExecution(flags),
  };
}

export async function buildAutonomousPaperworkExecutionDashboard(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  fetchedAt?: string;
}): Promise<AutonomousPaperworkExecutionDashboardSnapshot> {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);
  const maxRetries = input.sendQueueMetrics?.config.maxRetries ?? 3;

  const executionQueue = buildPaperworkExecutionQueue({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.flags,
    maxRetries,
    referenceMs,
  });

  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const eligibilityResults = input.candidates.map((row) =>
    buildPaperworkExecutionEligibility({
      row,
      onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
      policy: input.policy,
      flags: input.flags,
    }),
  );

  const readyCandidates = eligibilityResults.filter((row) => row.eligible).slice(0, 25);
  const blockedCandidates = eligibilityResults
    .filter((row) => !row.eligible && row.blockingReasons.length > 0)
    .slice(0, 25);

  const storedAudit = await loadPaperworkExecutionAuditLog();

  const previewAudit = readyCandidates.slice(0, 5).flatMap((candidate) => {
    const templateKey = candidate.templateKey ?? "onboarding_packet";
    return simulateExecutionWorkflow({
      candidateId: candidate.candidateId,
      candidateName: candidate.candidateId,
      templateLabel: ONBOARDING_TEMPLATE_REGISTRY[templateKey].label,
      executionMode: candidate.effectiveExecutionMode,
      referenceMs,
      wouldExecute: true,
      blockingReasons: [],
    }).auditEvents;
  });

  const recentAuditEvents = [...previewAudit, ...storedAudit].slice(0, 30);

  const sampleReady = readyCandidates[0] ?? blockedCandidates[0] ?? null;
  const sampleRow = sampleReady
    ? input.candidates.find((row) => row.candidateId === sampleReady.candidateId)
    : null;
  const sampleOnboarding = sampleReady
    ? onboardingByCandidate.get(sampleReady.candidateId) ?? null
    : null;

  const sampleTimeline = sampleReady && sampleRow
    ? buildCandidateExecutionTimeline({
        candidateId: sampleReady.candidateId,
        candidateName: `${sampleRow.firstName} ${sampleRow.lastName}`.trim(),
        templateLabel: ONBOARDING_TEMPLATE_REGISTRY[sampleReady.templateKey ?? "onboarding_packet"].label,
        executionMode: sampleReady.effectiveExecutionMode,
        wouldExecute: sampleReady.eligible,
        blockingReasons: sampleReady.blockingReasons,
        onboarding: sampleOnboarding,
        auditEvents: recentAuditEvents,
        referenceMs,
      })
    : [];

  const executiveMetrics = buildPaperworkExecutionExecutiveMetrics({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    executionQueue,
    sendQueueMetrics: input.sendQueueMetrics,
    fetchedAt,
  });

  const warnings = [
    "P71 controlled automation — execution disabled by default.",
    "Preview mode simulates workflow without Dropbox Sign, emails, or candidate mutations.",
  ];
  if (!input.flags.automationEnabled) {
    warnings.push("Automation is OFF — no packets will be sent.");
  }
  if (!canExecutePaperwork(input.flags)) {
    warnings.push("Production execution gated — enable automation, production mode, and Dropbox execution flag.");
  }

  return {
    sourcePhase: P71_SOURCE_PHASE,
    fetchedAt,
    controls: buildControls(input.flags),
    featureFlags: input.flags,
    executiveMetrics,
    executionQueue: executionQueue.slice(0, 50),
    blockedCandidates,
    readyCandidates,
    recentAuditEvents,
    sampleTimeline,
    warnings,
  };
}
