export { buildExecutivePaperworkDashboard } from "@/lib/executive-paperwork-dashboard/build-executive-paperwork-dashboard";
export {
  classifyPaperworkStage,
  detectPaperworkDrift,
  resolveAgeInStageHours,
  resolveExceptionReason,
} from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
export type {
  ApprovalQueueRecruiterRollup,
  ExecutivePaperworkCandidateRow,
  ExecutivePaperworkDashboard,
  ExecutivePaperworkKpiStrip,
  ExecutivePaperworkStageCard,
  ExecutivePaperworkStageId,
  PaperworkApprovalStatus,
  PaperworkSourceOfTruth,
} from "@/lib/executive-paperwork-dashboard/types";
export {
  EXECUTIVE_PAPERWORK_STAGE_LABELS,
  EXECUTIVE_PAPERWORK_STAGE_ORDER,
} from "@/lib/executive-paperwork-dashboard/types";
