import { buildWelcomeEmailPreview } from "@/lib/autonomous-onboarding-engine/build-welcome-and-training-preview";
import {
  resolveRecruitingContactPhone,
  resolveWelcomeReplyToEmail,
} from "@/lib/autonomous-onboarding-engine/training-module-registry";
import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import type { WelcomeEmailWorkflowPreview } from "@/lib/onboarding-pipeline-engine/types";

function resolveAssignedProject(input: {
  positionName?: string | null;
  suggestedProjects?: string[];
}): string | null {
  const project = input.suggestedProjects?.[0]?.trim();
  if (project) return project;
  const position = input.positionName?.trim();
  return position || null;
}

export function buildWelcomeEmailWorkflowPreview(input: {
  row: OnboardingPreviewCandidateInput;
  snapshot: OnboardingWorkspaceCandidateSnapshot;
  assignedDM: string;
  positionName?: string | null;
  suggestedProjects?: string[];
}): WelcomeEmailWorkflowPreview | null {
  const base = buildWelcomeEmailPreview({
    candidateId: input.row.candidateId,
    candidateName: input.snapshot.candidateName,
    email: input.row.email,
    assignedRecruiter: input.row.assignedRecruiter,
    training: input.snapshot.training,
    replyTo: resolveWelcomeReplyToEmail(),
    contactPhone: resolveRecruitingContactPhone(),
  });

  if (!base) return null;

  const assignedProject = resolveAssignedProject(input);
  const districtManager =
    input.assignedDM.trim() && input.assignedDM !== "Unassigned" ? input.assignedDM : "To be assigned";

  const onboardingSteps = [
    "Review and complete each training module linked below.",
    "Confirm your availability for your first store call.",
    "Reply to your recruiter with any scheduling questions.",
    assignedProject
      ? `Prepare for your assigned project: ${assignedProject}.`
      : "Your district manager will confirm project assignment after training.",
  ];

  const trainingExpectations = input.snapshot.training.modules
    .filter((row) => row.module.requiredForReadyForWork)
    .map((row) => `${row.module.label} — ${row.status === "complete" ? "complete" : "required before field work"}`);

  const bodyText = [
    base.bodyText,
    "",
    `District Manager: ${districtManager}`,
    assignedProject ? `Assigned Project: ${assignedProject}` : "Assigned Project: Pending assignment",
    "",
    "Next onboarding steps:",
    ...onboardingSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Training expectations:",
    ...trainingExpectations.map((line) => `- ${line}`),
  ].join("\n");

  return {
    ...base,
    previewOnly: true,
    districtManager,
    assignedProject,
    onboardingSteps,
    trainingExpectations,
    bodyText,
    bodyHtml: base.bodyHtml,
  };
}
