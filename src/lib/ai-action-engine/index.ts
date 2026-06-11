export {
  buildAiActionCenterSnapshot,
  type AiActionCenterContext,
} from "@/lib/ai-action-engine/build-ai-action-center-snapshot";
export { executeAiAction, executeAiActionBulk } from "@/lib/ai-action-engine/execute-action";
export { resolveInsightActions, resolveAllInsightActions } from "@/lib/ai-action-engine/resolve-insight-actions";
export { buildCandidateRecoveryList } from "@/lib/ai-action-engine/candidate-recovery-engine";
export { buildTerritoryRecoveryPlans } from "@/lib/ai-action-engine/territory-recovery-plans";
export { evaluateAiWorkflows } from "@/lib/ai-action-engine/workflow-builder";
export {
  getAiMemorySummary,
  listAiActionAudit,
  recordAiActionTaken,
  recordAiRecommendation,
} from "@/lib/ai-action-engine/ai-action-store";
export {
  AI_ACTION_LABELS,
  AI_ACTION_IMPACT,
  DEFAULT_AI_WORKFLOW_RULES,
} from "@/lib/ai-action-engine/action-registry";
export { AI_ACTION_ENGINE_ALLOWS_AUTOMATION, assertManualConfirmationRequired } from "@/lib/ai-action-engine/automation-guard";
export type {
  AiActionCenterSnapshot,
  AiActionAuditEntry,
  AiActionExecutionResult,
  AiActionKind,
  AiActionPayload,
  AiActionProposal,
  AiMemoryRecord,
  AiWorkflowRule,
  CandidateRecoveryItem,
  ExecutiveActionItem,
  TerritoryRecoveryPlan,
  TriggeredWorkflow,
} from "@/lib/ai-action-engine/types";
