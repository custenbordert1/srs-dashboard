import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CommunicationDecision } from "@/lib/autonomous-candidate-communication-engine/types";
import { buildCandidateCommunicationTimeline } from "@/lib/autonomous-candidate-communication-engine/build-candidate-communication-timeline";
import type {
  OrchestratorEngineId,
  OrchestratorExecutionMode,
  OrchestratorTimelineStep,
} from "@/lib/autonomous-recruiting-orchestrator/types";

const ENGINE_MAP: Record<string, OrchestratorEngineId> = {
  application_received: "recruiting_intelligence",
  interview_invitation: "recruiting_intelligence",
  interview_reminder: "recruiting_intelligence",
  recruiter_follow_up: "recruiting_intelligence",
  candidate_inactivity_reminder: "recruiting_intelligence",
  paperwork_ready: "paperwork_intelligence",
  paperwork_sent: "paperwork_execution",
  reminder_24h: "communication",
  reminder_48h: "communication",
  final_reminder: "communication",
  paperwork_completed: "paperwork_intelligence",
  welcome_email: "onboarding",
  training_instructions: "onboarding",
  mel_survey_assignment: "onboarding",
  store_call_assignment: "onboarding",
  ready_for_work_confirmation: "onboarding",
};

export function buildCandidateOrchestrationTimeline(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  communicationDecisions: CommunicationDecision[];
  executionMode: OrchestratorExecutionMode;
}): OrchestratorTimelineStep[] {
  const steps: OrchestratorTimelineStep[] = [];
  const preview = input.executionMode !== "production";

  if (input.row.appliedDate) {
    steps.push({
      id: "applied",
      at: input.row.appliedDate,
      label: "Applied",
      engine: "recruiting_intelligence",
      reason: "Candidate application received",
      result: "Entered workflow",
      executionMode: input.executionMode,
      preview,
    });
  }

  if (input.row.aiGrade) {
    steps.push({
      id: "grade",
      at: input.row.actionGeneratedAt ?? input.row.appliedDate ?? new Date().toISOString(),
      label: "Grade assigned",
      engine: "recruiting_intelligence",
      reason: "Resume analyzed and graded",
      result: `Grade ${input.row.aiGrade}`,
      executionMode: input.executionMode,
      preview,
    });
  }

  if (input.row.actionGeneratedAt) {
    steps.push({
      id: "recruiter-approved",
      at: input.row.actionGeneratedAt,
      label: "Recruiter approved",
      engine: "recruiting_intelligence",
      reason: "Recruiter action generated",
      result: input.row.actionType ?? "Approved",
      executionMode: input.executionMode,
      preview,
    });
  }

  if (input.row.paperworkSentAt) {
    steps.push({
      id: "paperwork-sent",
      at: input.row.paperworkSentAt,
      label: "Paperwork sent",
      engine: "paperwork_execution",
      reason: "Onboarding packet dispatched",
      result: "Waiting signature",
      executionMode: input.executionMode,
      preview,
    });
  }

  const commTimeline = buildCandidateCommunicationTimeline({
    row: input.row,
    onboarding: input.onboarding,
    decisions: input.communicationDecisions,
  });

  for (const step of commTimeline) {
    if (!step.communicationType) continue;
    steps.push({
      id: `comm-${step.id}`,
      at: step.at,
      label: step.label,
      engine: ENGINE_MAP[step.communicationType] ?? "communication",
      reason: step.detail ?? "Communication event",
      result: step.status,
      executionMode: input.executionMode,
      preview,
    });
  }

  if (input.row.paperworkSignedAt) {
    steps.push({
      id: "signature-complete",
      at: input.row.paperworkSignedAt,
      label: "Signature complete",
      engine: "paperwork_intelligence",
      reason: "Paperwork signed",
      result: "Onboarding assigned",
      executionMode: input.executionMode,
      preview,
    });
  }

  if (input.row.workflowStatus === "Training Needed" || input.row.workflowStatus === "Ready for MEL") {
    steps.push({
      id: "training",
      at: input.row.lastActionAt ?? input.row.paperworkSignedAt ?? new Date().toISOString(),
      label: "Training assigned",
      engine: "onboarding",
      reason: "Onboarding training modules",
      result: input.row.workflowStatus,
      executionMode: input.executionMode,
      preview,
    });
  }

  if (input.row.workflowStatus === "Active Rep") {
    steps.push({
      id: "ready-for-work",
      at: input.row.lastActionAt ?? new Date().toISOString(),
      label: "Ready for Work",
      engine: "onboarding",
      reason: "Onboarding complete",
      result: "Workflow complete",
      executionMode: input.executionMode,
      preview,
    });
  }

  return steps.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
