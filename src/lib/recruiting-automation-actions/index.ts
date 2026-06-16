export type {
  AutomationActionType,
  AutomationApprovalStatus,
  AutomationAuditLogEntry,
  AutomationControlCenterSnapshot,
  AutomationControlCenterSummary,
  AutomationDraftPayload,
  AutomationPriority,
  AutomationSafetyMode,
  CampaignCandidateEntry,
  FollowUpCampaignDraftPayload,
  FollowUpCampaignType,
  JobRefreshDraftPayload,
  ManualTaskDraftPayload,
  OutreachMethod,
  PostingDraftPayload,
  RecruitingAutomationRecord,
  SourceRecommendationRef,
} from "@/lib/recruiting-automation-actions/types";
export {
  DEFAULT_AUTOMATION_SAFETY_MODE,
  ENABLED_AUTOMATION_SAFETY_MODES,
} from "@/lib/recruiting-automation-actions/types";
export {
  DEFAULT_MESSAGE_TEMPLATES,
  getMessageTemplate,
  renderMessageTemplate,
} from "@/lib/recruiting-automation-actions/message-templates";
export {
  canApproveAutomation,
  canExecuteAutomation,
  canSubmitForApproval,
  isAutomationModeEnabled,
  isExecutableStatus,
  resolveAutomationSafetyMode,
} from "@/lib/recruiting-automation-actions/safety-rules";
export {
  appendAuditEntry,
  buildAutomationRecord,
  getAutomationRecord,
  getAutomationSafetyMode,
  listAutomationRecords,
  readAutomationStore,
  setAutomationSafetyMode,
  upsertAutomationRecord,
  upsertAutomationRecords,
  writeAutomationStore,
} from "@/lib/recruiting-automation-actions/store";
export {
  approveAutomation,
  cancelAutomation,
  executeAutomation,
  markAutomationCompleted,
  markAutomationFailed,
  previewAutomation,
  submitAutomationForApproval,
} from "@/lib/recruiting-automation-actions/approval-workflow";
export {
  executeAutomationAdapter,
  executeBreezyJobCreationAdapter,
  executeBreezyJobRefreshAdapter,
  executeEmailCampaignAdapter,
  executeManualTaskAdapter,
} from "@/lib/recruiting-automation-actions/adapters";
export { onAutomationCompleted } from "@/lib/recruiting-automation-actions/p38-integration";
export {
  buildCampaignDraftFromOpportunity,
  buildJobRefreshDraftFromRecommendation,
  buildPostingDraftFromTerritory,
  generateDraftsFromIntelligence,
  syncAutomationDrafts,
} from "@/lib/recruiting-automation-actions/generate-drafts";
export { buildAutomationControlCenterSnapshot } from "@/lib/recruiting-automation-actions/build-snapshot";
