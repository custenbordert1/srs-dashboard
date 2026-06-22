export { advanceWorkflowOnComplete } from "@/lib/candidate-workspace/advance-workflow-on-complete";
export { buildCandidateTimeline } from "@/lib/candidate-workspace/build-candidate-timeline";
export { buildCommunicationLog } from "@/lib/candidate-workspace/build-communication-log";
export { buildMelReadinessChecklist } from "@/lib/candidate-workspace/build-mel-readiness";
export { resolveWorkspaceAction } from "@/lib/candidate-workspace/resolve-workspace-action";
export type {
  CandidateTimelineEntry,
  CommunicationLogEntry,
  MelReadinessItem,
  WorkflowAdvancementResult,
  WorkspaceAction,
  WorkspaceActionKind,
} from "@/lib/candidate-workspace/types";
