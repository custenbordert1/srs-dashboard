import { buildOnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildOnboardingActivityHistory } from "@/lib/onboarding-pipeline-engine/build-activity-history";
import { buildOnboardingPipelinePreviewActions } from "@/lib/onboarding-pipeline-engine/build-preview-actions";
import { buildOnboardingReadinessScore } from "@/lib/onboarding-pipeline-engine/build-readiness-score";
import {
  buildPrioritizedRecruiterActions,
  buildWaitingDays,
} from "@/lib/onboarding-pipeline-engine/build-prioritized-recruiter-actions";
import { buildTrainingWorkflowAssignments } from "@/lib/onboarding-pipeline-engine/build-training-workflow-preview";
import { buildWelcomeEmailWorkflowPreview } from "@/lib/onboarding-pipeline-engine/build-welcome-email-workflow";
import { buildWelcomeWorkflowTasks } from "@/lib/onboarding-pipeline-engine/build-welcome-workflow-tasks";
import {
  buildOnboardingDueDateSchedule,
  dueDateForStage,
} from "@/lib/onboarding-pipeline-engine/due-date-engine";
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
  OnboardingPipelineCandidateContext,
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
  schedule: ReturnType<typeof buildOnboardingDueDateSchedule>;
}): OnboardingPipelineTimelineEntry[] {
  const currentIndex = P80_ONBOARDING_PIPELINE_STAGES.indexOf(input.stage);

  return P80_ONBOARDING_PIPELINE_STAGES.map((id, index) => {
    let status: OnboardingPipelineTimelineEntry["status"] = "upcoming";
    if (input.stage === "ready_for_work" || index < currentIndex) {
      status = "completed";
    } else if (index === currentIndex) {
      status = "current";
    }

    const dueAt = dueDateForStage(input.schedule, id);

    return {
      id,
      label: pipelineStageLabel(id),
      status,
      at: status === "upcoming" ? null : resolveStageTimestamp(id, input.snapshot, input.paperworkSignedAt),
      detail:
        status === "current"
          ? input.snapshot.nextStepLabel
          : status === "upcoming"
            ? `Due ${new Date(dueAt).toLocaleDateString()}`
            : null,
    };
  });
}

export function buildOnboardingPipelineRecord(input: {
  row: OnboardingPreviewCandidateInput;
  onboarding: CandidateOnboardingRecord | null;
  referenceAt?: string;
  context?: OnboardingPipelineCandidateContext;
}): OnboardingPipelineRecord {
  const referenceAt = input.referenceAt ?? new Date().toISOString();
  const snapshot = buildOnboardingWorkspaceCandidateSnapshot({
    row: input.row,
    onboarding: input.onboarding,
    referenceAt,
  });

  const stage = resolveOnboardingPipelineStage(snapshot);
  const completedStages = buildCompletedPipelineStages(stage);
  const progressPercent = buildPipelineProgressPercent(stage);
  const stalled = snapshot.stall.level !== "normal";
  const schedule = buildOnboardingDueDateSchedule({
    paperworkSignedAt: input.row.paperworkSignedAt ?? null,
    referenceAt,
  });

  const welcomeEmail = buildWelcomeEmailWorkflowPreview({
    row: input.row,
    snapshot,
    assignedDM: input.context?.assignedDM ?? "Unassigned",
    positionName: input.context?.positionName ?? null,
    suggestedProjects: input.context?.suggestedProjects ?? [],
  });

  const workflowTasks = buildWelcomeWorkflowTasks({ currentStage: stage, snapshot, schedule });
  const trainingAssignments = buildTrainingWorkflowAssignments({ snapshot, schedule });
  const readiness = buildOnboardingReadinessScore({
    snapshot,
    stage,
    welcomeGenerated: Boolean(welcomeEmail),
  });
  const waitingDays = buildWaitingDays({
    paperworkSignedAt: input.row.paperworkSignedAt ?? null,
    referenceAt,
  });
  const recruiterActions = buildPrioritizedRecruiterActions({
    snapshot,
    stage,
    schedule,
    referenceAt,
    stalled,
    waitingDays,
  });
  const activityHistory = buildOnboardingActivityHistory(snapshot);
  const currentStageDueAt = dueDateForStage(schedule, stage);

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
      schedule,
    }),
    stalled,
    stallReason: stalled ? snapshot.stall.reason : null,
    previewActions: buildOnboardingPipelinePreviewActions({ stage, snapshot }),
    recruiterActions,
    paperworkSignedAt: input.row.paperworkSignedAt ?? null,
    previewMode: true,
    welcomeEmail,
    workflowTasks,
    trainingAssignments,
    readiness,
    dueDates: {
      anchorAt: schedule.anchorAt,
      estimatedReadyForWorkAt: schedule.estimatedReadyForWorkAt,
      currentStageDueAt,
    },
    estimatedCompletionAt: schedule.estimatedReadyForWorkAt,
    waitingDays,
    activityHistory,
  };
}
