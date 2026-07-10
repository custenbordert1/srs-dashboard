export { buildAutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/build-autonomous-paperwork-report";
export { runAutonomousPaperworkEngine } from "@/lib/p106-autonomous-paperwork-engine/run-autonomous-paperwork-engine";
export { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
export {
  autoRepairCandidatePaperwork,
  buildCandidateApprovalEntry,
} from "@/lib/p106-autonomous-paperwork-engine/auto-repair-candidate-paperwork";
export type {
  AutonomousPaperworkCandidateResult,
  AutonomousPaperworkMetrics,
  AutonomousPaperworkReport,
  AutonomousPaperworkRunMode,
  AutonomousPaperworkRunResult,
  PaperworkBlockerCategory,
} from "@/lib/p106-autonomous-paperwork-engine/types";
export { P106_DEFAULT_MODE, P106_SOURCE_PHASE } from "@/lib/p106-autonomous-paperwork-engine/types";
