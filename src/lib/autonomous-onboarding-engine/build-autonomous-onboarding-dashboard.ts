import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import { listAutomationHookDefinitions } from "@/lib/autonomous-onboarding-engine/build-automation-hook-definitions";
import { buildOnboardingExecutiveProgressMetrics } from "@/lib/autonomous-onboarding-engine/build-executive-progress-metrics";
import {
  buildOnboardingWorkspaceCandidateSnapshot,
  isAutonomousOnboardingPipelineCandidate,
} from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";
import type {
  AutonomousOnboardingDashboardSnapshot,
  AutonomousOnboardingKpis,
  AutonomousOnboardingState,
} from "@/lib/autonomous-onboarding-engine/types";
import { P67_PREVIEW_MODE, P67_SOURCE_MODULE, P67_SOURCE_PHASE } from "@/lib/autonomous-onboarding-engine/types";

function toPreviewInput(row: ScoredCandidateWorkflowRow): OnboardingPreviewCandidateInput {
  return {
    candidateId: row.candidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    paperworkError: row.paperworkError,
    paperworkSentAt: row.paperworkSentAt,
    paperworkSignedAt: row.paperworkSignedAt,
    signatureRequestId: row.signatureRequestId,
    assignedRecruiter: row.assignedRecruiter,
  };
}

function emptyKpis(): AutonomousOnboardingKpis {
  return {
    inPipeline: 0,
    paperworkSent: 0,
    paperworkSigned: 0,
    welcomePrepared: 0,
    trainingAssigned: 0,
    trainingInProgress: 0,
    readyForWork: 0,
    assigned: 0,
    archived: 0,
  };
}

function incrementKpis(kpis: AutonomousOnboardingKpis, state: AutonomousOnboardingState): void {
  kpis.inPipeline += 1;
  switch (state) {
    case "paperwork_sent":
      kpis.paperworkSent += 1;
      break;
    case "paperwork_signed":
      kpis.paperworkSigned += 1;
      break;
    case "welcome_prepared":
      kpis.welcomePrepared += 1;
      break;
    case "training_assigned":
      kpis.trainingAssigned += 1;
      break;
    case "training_in_progress":
      kpis.trainingInProgress += 1;
      break;
    case "ready_for_work":
      kpis.readyForWork += 1;
      break;
    case "assigned":
      kpis.assigned += 1;
      break;
    case "archived":
      kpis.archived += 1;
      break;
    default:
      break;
  }
}

export function buildAutonomousOnboardingDashboardSnapshot(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  fetchedAt?: string;
}): AutonomousOnboardingDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const onboardingByCandidate = new Map<string, CandidateOnboardingRecord>();

  for (const record of input.onboardingRecords) {
    const existing = onboardingByCandidate.get(record.candidateId);
    if (!existing || Date.parse(record.createdAt) > Date.parse(existing.createdAt)) {
      onboardingByCandidate.set(record.candidateId, record);
    }
  }

  const pipelineRows = input.candidates.filter((row) =>
    isAutonomousOnboardingPipelineCandidate(row),
  );
  const kpis = emptyKpis();
  const stateDistribution: Partial<Record<AutonomousOnboardingState, number>> = {};

  const candidates = pipelineRows.map((row) => {
    const previewRow = toPreviewInput(row);
    const snapshot = buildOnboardingWorkspaceCandidateSnapshot({
      row: previewRow,
      onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
      referenceAt: fetchedAt,
    });
    incrementKpis(kpis, snapshot.currentState);
    stateDistribution[snapshot.currentState] = (stateDistribution[snapshot.currentState] ?? 0) + 1;
    return snapshot;
  });

  candidates.sort((a, b) => a.candidateName.localeCompare(b.candidateName));

  const referenceMs = Date.parse(fetchedAt);
  const progressMetrics = buildOnboardingExecutiveProgressMetrics({ candidates, referenceMs });
  const stalledCandidates = candidates
    .filter((row) => row.stall.level !== "normal")
    .map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      stall: row.stall,
      progressPercent: row.progress.progressPercent,
      lastActivity: row.lastActivity,
    }))
    .sort((a, b) => {
      const rank = { blocked: 0, high_risk: 1, needs_attention: 2, normal: 3 };
      return rank[a.stall.level] - rank[b.stall.level];
    });

  const sample =
    candidates.find((row) => row.welcomeEmail != null) ??
    candidates.find((row) => row.currentState === "paperwork_sent") ??
    candidates[0] ??
    null;

  return {
    fetchedAt,
    scope: "mtd",
    previewMode: P67_PREVIEW_MODE,
    phase: P67_SOURCE_PHASE,
    module: P67_SOURCE_MODULE,
    kpis,
    progressMetrics,
    stalledCandidates,
    stateDistribution,
    automationHooks: listAutomationHookDefinitions(),
    candidates,
    sampleCandidateId: sample?.candidateId ?? null,
  };
}
