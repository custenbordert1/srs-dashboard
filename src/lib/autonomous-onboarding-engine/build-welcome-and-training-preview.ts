import type { TrainingAssignmentPreview } from "@/lib/autonomous-onboarding-engine/types";
import {
  listTrainingModules,
  resolveTrainingModuleUrl,
} from "@/lib/autonomous-onboarding-engine/training-module-registry";
import {
  isPaperworkSigned,
  resolveAutonomousOnboardingState,
} from "@/lib/autonomous-onboarding-engine/state-machine";
import type { ResolveOnboardingStateInput } from "@/lib/autonomous-onboarding-engine/types";

function firstName(fullName: string): string {
  const token = fullName.trim().split(/\s+/)[0]?.replace(/[.,]+$/, "") ?? "";
  return token.length > 0 && !/^unknown$/i.test(token) ? token : "there";
}

function previewTrainingStatus(input: {
  moduleKey: string;
  state: ReturnType<typeof resolveAutonomousOnboardingState>;
  workflowStatus: string;
}): TrainingAssignmentPreview["modules"][number]["status"] {
  if (input.state === "archived" || input.state === "paperwork_pending" || input.state === "paperwork_sent") {
    return "not_assigned";
  }
  if (input.state === "welcome_prepared") return "not_assigned";
  if (input.state === "training_assigned") return "assigned";
  if (input.state === "training_in_progress") {
    if (input.moduleKey === "mel_test_survey") return "complete";
    return "in_progress";
  }
  if (
    input.state === "training_complete" ||
    input.state === "ready_for_work" ||
    input.state === "assigned"
  ) {
    return "complete";
  }
  if (input.workflowStatus === "Training Needed") return "in_progress";
  return "assigned";
}

export function buildTrainingAssignmentPreview(input: {
  candidateId: string;
  candidateName: string;
  workflowStatus: string;
  paperworkStatus: string;
  onboardingStatus?: string | null;
  referenceAt?: string;
}): TrainingAssignmentPreview {
  const resolveInput: ResolveOnboardingStateInput = {
    candidateId: input.candidateId,
    workflowStatus: input.workflowStatus,
    paperworkStatus: input.paperworkStatus,
    onboardingStatus: input.onboardingStatus,
    trainingComplete:
      input.workflowStatus === "Active Rep" || input.workflowStatus === "Training Needed",
    acknowledgementsComplete: isPaperworkSigned({
      candidateId: input.candidateId,
      workflowStatus: input.workflowStatus,
      paperworkStatus: input.paperworkStatus,
      onboardingStatus: input.onboardingStatus,
    }),
  };
  const state = resolveAutonomousOnboardingState(resolveInput);
  const referenceAt = input.referenceAt ?? new Date().toISOString();

  const modules = listTrainingModules().map((module) => {
    const status = previewTrainingStatus({
      moduleKey: module.key,
      state,
      workflowStatus: input.workflowStatus,
    });
    const assignedAt =
      status === "not_assigned" || status === "blocked" ? null : referenceAt;
    const completedAt = status === "complete" ? referenceAt : null;
    const completionPercent =
      status === "complete" ? 100 : status === "in_progress" ? 45 : status === "assigned" ? 0 : null;

    return {
      module,
      url: resolveTrainingModuleUrl(module),
      status,
      assignedAt,
      completedAt,
      completionPercent,
    };
  });

  const required = modules.filter((row) => row.module.requiredForReadyForWork);
  const completeCount = required.filter((row) => row.status === "complete").length;
  const assignedCount = required.filter((row) => row.status !== "not_assigned" && row.status !== "blocked").length;

  return {
    candidateId: input.candidateId,
    modules,
    allRequiredComplete: completeCount === required.length && required.length > 0,
    assignedCount,
    completeCount,
  };
}

export function buildWelcomeEmailPreview(input: {
  candidateId: string;
  candidateName: string;
  email: string | null;
  assignedRecruiter: string;
  training: TrainingAssignmentPreview;
  replyTo: string;
  contactPhone: string;
}): import("@/lib/autonomous-onboarding-engine/types").WelcomeEmailPreview | null {
  if (!input.email?.trim()) return null;

  const greeting = firstName(input.candidateName);
  const trainingLinks = input.training.modules
    .filter((row) => row.status !== "not_assigned" && row.status !== "blocked")
    .map((row) => ({ label: row.module.label, url: row.url }));

  const nextSteps = [
    "Complete each training module linked below.",
    "Reply to this email or contact your recruiter if you have scheduling questions.",
    "Watch for a follow-up when you are cleared for project assignment.",
  ];

  const linkLines = trainingLinks.map((row) =>
    row.url ? `• ${row.label}: ${row.url}` : `• ${row.label}: (link configured at activation)`,
  );

  const bodyText = [
    `Hi ${greeting},`,
    "",
    "Welcome to SRS Merchandising — we're excited to have you join the team.",
    "",
    "Your onboarding paperwork is complete. Here are your next steps:",
    "",
    ...nextSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Training resources:",
    ...(linkLines.length > 0 ? linkLines : ["• Training links will appear once modules are assigned."]),
    "",
    `Your recruiter: ${input.assignedRecruiter}`,
    `Questions: reply to ${input.replyTo} or call ${input.contactPhone}`,
    "",
    "Thank you,",
    "SRS Merchandising Onboarding",
  ].join("\n");

  const bodyHtml = bodyText
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br/>" : `<p>${line}</p>`))
    .join("");

  return {
    candidateId: input.candidateId,
    subject: `${greeting}, welcome to SRS Merchandising — your onboarding next steps`,
    bodyText,
    bodyHtml,
    recipientEmail: input.email.trim(),
    replyTo: input.replyTo,
    trainingLinks,
    nextSteps,
    previewOnly: true,
  };
}
