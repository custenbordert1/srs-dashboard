export {
  buildAutonomousCandidateCommunicationDashboard,
  buildCandidateCommunicationPreview,
} from "@/lib/autonomous-candidate-communication-engine/build-communication-dashboard";
export { buildCommunicationDecisions, buildCommunicationDecisionsForCandidate } from "@/lib/autonomous-candidate-communication-engine/build-communication-decisions";
export { buildP73NlAnswers, isP73CommunicationQueryId } from "@/lib/autonomous-candidate-communication-engine/build-p73-nl-answers";
export {
  COMMUNICATION_PREVIEW_TEMPLATES,
  getCommunicationTemplate,
  renderPreviewTemplate,
  buildTemplateVariables,
} from "@/lib/autonomous-candidate-communication-engine/communication-templates";
export {
  DEFAULT_P73_FEATURE_FLAGS,
  loadP73FeatureFlags,
  saveP73FeatureFlags,
  canExecuteCommunication,
  isPreviewCommunication,
} from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
export { runAutonomousCandidateCommunicationPreview } from "@/lib/autonomous-candidate-communication-engine/run-autonomous-candidate-communication-preview";
export {
  P73_PREVIEW_MODE,
  P73_SOURCE_PHASE,
  P73_DEFAULT_COMMUNICATION_ENABLED,
  P73_DEFAULT_EXECUTION_MODE,
} from "@/lib/autonomous-candidate-communication-engine/types";
export type {
  AutonomousCandidateCommunicationDashboardSnapshot,
  AutonomousCandidateCommunicationPreviewResult,
  CandidateCommunicationPreviewSnapshot,
  CommunicationAuditEvent,
  CommunicationAutomationControls,
  CommunicationDecision,
  CommunicationEventType,
  CommunicationExecutionMode,
  CommunicationHealthMetrics,
  CommunicationPreviewTemplate,
  CommunicationQueueItem,
  CommunicationQueueStatus,
  CommunicationRecipientRole,
  CommunicationTimelineStep,
  P73FeatureFlags,
} from "@/lib/autonomous-candidate-communication-engine/types";
