import { buildOnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildOnboardingPipelinePreviewActions } from "@/lib/onboarding-pipeline-engine/build-preview-actions";
import { buildOnboardingPipelineRecruiterActions } from "@/lib/onboarding-pipeline-engine/build-recruiter-actions";
import {
  buildCompletedPipelineStages,
  buildPipelineProgressPercent,
  resolveOnboardingPipelineStage,
} from "@/lib/onboarding-pipeline-engine/resolve-pipeline-stage";
import {
  P80_ONBOARDING_PIPELINE_STAGES,
  pipelineStageLabel,
} from "@/lib/onboarding-pipeline-engine/stages";
import type {
  OnboardingPipelineRecord,
  OnboardingPipelineStage,
  OnboardingPipelineTimelineEntry,
} from "@/lib/onboarding-pipeline-engine/types";

function resolveStageTimestamp(
  stage: OnboardingPipelineStage,
  snapshot: ReturnType<typeof buildOnboardingWorkspaceCandidateSnapshot>,
  paperworkSignedAt: string | null,
): string | null {
  switch (stage) {
    case "paperwork_complete":
      return paperworkSignedAt ?? snapshot.timeline.find((row) => row.id === "paperwork-signed")?.at ?? null;
    case "welcome_email_ready":
      return snapshot.welcomeEmail ? snapshot.timeline.find((row) => row.id === "paperwork-signed")?.at ?? null : null;
    case "mel_test_assigned":
      return (
        snapshot.training.modules.find((row) => row.module.key === "mel_test_survey")?.assignedAt ?? null
      );
    case "store_call_assigned":
      return (
        snapshot.training.modules.find((row) => row.module.key === "store_call_training")?.assignedAt ?? null
      );
    case "training_pending":
      return snapshot.lastActivity?.completedAt ?? null;
    case "ready_for_work":
      return snapshot.readiness.readyAt ?? null;
    default:
      return null;
  }
}

function buildPipelineTimeline(input: {
  stage: OnboardingPipelineStage;
  snapshot: ReturnType<typeof buildOnboardingWorkspaceCandidateSnapshot>;
  paperworkSignedAt: string | null;
}): OnboardingPipelineTimelineEntry[] {
  const currentIndex = P80_ONBOARDING_PIPELINE_STAGES.indexOf(input.stage);

  return P80_ONBOARDING_PIPELINE_STAGES.map((id, index) => {
    let status: OnboardingPipelineTimelineEntry["status"] = "upcoming";
    if (input.stage === "ready_for_work" || index < currentIndex) {
      status = "completed";
    } else if (index === currentIndex) {
      status = "current";
    }

    return {
      id,
      label: pipelineStageLabel(id),
      status,
      at: status === "upcoming" ? null : resolveStageTimestamp(id, input.snapshot, input.paperworkSignedAt),
      detail: status === "current" ? input.snapshot.nextStepLabel : null,
    };
  });
}

export function buildOnboardingPipelineRecord(input: {
  row: OnboardingPreviewCandidateInput;
  onboarding: CandidateOnboardingRecord | null;
  referenceAt?: string;
}): OnboardingPipelineRecord {
  const snapshot = buildOnboardingWorkspaceCandidateSnapshot({
    row: input.row,
    onboarding: input.onboarding,
    referenceAt: input.referenceAt,
  });

  const stage = resolveOnboardingPipelineStage(snapshot);
  const completedStages = buildCompletedPipelineStages(stage);
  const progressPercent = buildPipelineProgressPercent(stage);
  const stalled = snapshot.stall.level !== "normal";

  return {
    candidateId: input.row.candidateId,
    candidateName: snapshot.candidateName,
    email: input.row.email?.trim() || null,
    assignedRecruiter: input.row.assignedRecruiter,
    stage,
    stageLabel: pipelineStageLabel(stage),
    progressPercent,
    completedStages,
    timeline: buildPipelineTimeline({
      stage,
      snapshot,
      paperworkSignedAt: input.row.paperworkSignedAt ?? null,
    }),
    stalled,
    stallReason: stalled ? snapshot.stall.reason : null,
    previewActions: buildOnboardingPipelinePreviewActions({ stage, snapshot }),
    recruiterActions: buildOnboardingPipelineRecruiterActions({ snapshot, stalled }),
    paperworkSignedAt: input.row.paperworkSignedAt ?? null,
    previewMode: true,
  };
}
