export { buildP168ExecutiveApprovalReport, executeP168ExecutiveApproval } from "@/lib/p168-executive-approval/approval-engine";
export {
  buildApprovalRecommendation,
  evaluateRunNextBatchGates,
} from "@/lib/p168-executive-approval/build-approval-recommendation";
export {
  loadP168ApprovalHistory,
  appendP168ApprovalHistoryEntry,
  resolveP168LastExecution,
} from "@/lib/p168-executive-approval/approval-history";
export { validateP168ReadOnly, assertP168UsesExistingProductionPath } from "@/lib/p168-executive-approval/approval-validation";
export { emptyP168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/empty-report";
export { formatP168Markdown, actionLabel, riskTone } from "@/lib/p168-executive-approval/presentation";
export type {
  P168ApprovalAction,
  P168ApprovalRecommendation,
  P168ApprovalHistoryEntry,
  P168ExecutiveApprovalReport,
  P168ApproveRequest,
  P168ApproveResult,
  P168RiskLevel,
} from "@/lib/p168-executive-approval/approval-types";
export { P168_SOURCE_PHASE } from "@/lib/p168-executive-approval/approval-types";
