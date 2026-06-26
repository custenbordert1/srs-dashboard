import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  canExecuteCommunication,
  isPreviewCommunication,
} from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { buildPilotSummary } from "@/lib/autonomous-candidate-communication-engine/pilot-filters";
import { buildCommunicationAuditTrail } from "@/lib/autonomous-candidate-communication-engine/build-communication-audit";
import {
  buildCommunicationDecisions,
  buildCommunicationDecisionsForCandidate,
} from "@/lib/autonomous-candidate-communication-engine/build-communication-decisions";
import { buildCandidateCommunicationTimeline } from "@/lib/autonomous-candidate-communication-engine/build-candidate-communication-timeline";
import { buildCommunicationHealthMetrics } from "@/lib/autonomous-candidate-communication-engine/build-communication-health-metrics";
import {
  buildCommunicationQueue,
  simulatePreviewSentQueueItems,
} from "@/lib/autonomous-candidate-communication-engine/build-communication-queue";
import { buildSampleCommunicationTimeline } from "@/lib/autonomous-candidate-communication-engine/build-candidate-communication-timeline";
import type {
  AutonomousCandidateCommunicationDashboardSnapshot,
  CandidateCommunicationPreviewSnapshot,
  CommunicationAutomationControls,
  P73FeatureFlags,
} from "@/lib/autonomous-candidate-communication-engine/types";
import { P73_PREVIEW_MODE, P73_SOURCE_PHASE } from "@/lib/autonomous-candidate-communication-engine/types";

function buildControls(flags: P73FeatureFlags): CommunicationAutomationControls {
  return {
    communicationEnabled: flags.communicationEnabled,
    executionMode: flags.executionMode,
    emailEnabled: flags.emailEnabled,
    smsEnabled: flags.smsEnabled,
    pilotSummary: buildPilotSummary(flags),
    canExecute: canExecuteCommunication(flags),
    previewOnly: isPreviewCommunication(flags),
  };
}

function buildLeadershipSummary(health: ReturnType<typeof buildCommunicationHealthMetrics>): string {
  const top = health.topCommunicationTypes[0];
  return [
    `Communications today: ${health.communicationsToday}`,
    `Preview sent: ${health.previewSent}`,
    `Waiting approval: ${health.waitingApproval}`,
    `Failures: ${health.failures}`,
    top ? `Top type: ${top.type.replace(/_/g, " ")} (${top.count})` : null,
    `Automation: ${health.automationPercent ?? 0}%`,
    `Recruiter work eliminated: ${health.recruiterWorkEliminated}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAutonomousCandidateCommunicationDashboard(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P73FeatureFlags;
  fetchedAt?: string;
}): AutonomousCandidateCommunicationDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const decisions = buildCommunicationDecisions({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.flags,
    referenceMs,
    fetchedAt,
  });

  const candidatesById = new Map(input.candidates.map((row) => [row.candidateId, row] as const));
  const rawQueue = buildCommunicationQueue({ decisions, candidatesById });
  const queue = simulatePreviewSentQueueItems(rawQueue);
  const health = buildCommunicationHealthMetrics({ queue, referenceMs });
  const recentAudit = buildCommunicationAuditTrail({ queue, fetchedAt }).slice(0, 25);

  const sampleRow =
    input.candidates.find((row) => row.paperworkSentAt || row.paperworkSignedAt) ?? input.candidates[0] ?? null;
  const sampleDecisions = sampleRow
    ? decisions.filter((d) => d.candidateId === sampleRow.candidateId)
    : decisions.slice(0, 5);

  const warnings = [
    "Preview mode — simulated communications only, no SMTP, SendGrid, Gmail, Outlook, or Twilio.",
    "No live emails, SMS, production writes, or candidate mutations.",
    "P73 communication execution remains disabled unless production flags are explicitly enabled.",
  ];

  if (!input.flags.communicationEnabled) {
    warnings.push("Communication automation is OFF — decisions are computed for preview only.");
  }

  return {
    sourcePhase: P73_SOURCE_PHASE,
    previewMode: P73_PREVIEW_MODE,
    fetchedAt,
    controls: buildControls(input.flags),
    health,
    queue: queue.slice(0, 50),
    recentAudit,
    sampleTimeline: buildSampleCommunicationTimeline({ row: sampleRow, decisions: sampleDecisions }),
    leadershipSummary: buildLeadershipSummary(health),
    warnings,
  };
}

export function buildCandidateCommunicationPreview(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  flags: P73FeatureFlags;
  fetchedAt?: string;
}): CandidateCommunicationPreviewSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const decisions = buildCommunicationDecisionsForCandidate({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
    flags: input.flags,
    referenceMs,
    fetchedAt,
  });

  const candidatesById = new Map([[input.row.candidateId, input.row]]);
  const rawQueue = buildCommunicationQueue({ decisions, candidatesById });
  const queue = simulatePreviewSentQueueItems(rawQueue);
  const audit = buildCommunicationAuditTrail({ queue, fetchedAt });

  return {
    candidateId: input.row.candidateId,
    candidateName: `${input.row.firstName} ${input.row.lastName}`.trim(),
    decisions,
    queue,
    timeline: buildCandidateCommunicationTimeline({
      row: input.row,
      onboarding: input.onboarding,
      decisions,
    }),
    audit,
  };
}
