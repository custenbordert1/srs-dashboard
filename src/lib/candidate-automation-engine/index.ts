export type {
  AutomationRunTrigger,
  CandidateAutomationHealth,
  CandidateAutomationMode,
  CandidateAutomationPolicy,
  CandidateAutomationRunRecord,
  CandidateAutomationRunResult,
} from "@/lib/candidate-automation-engine/types";
export {
  DEFAULT_CANDIDATE_AUTOMATION_POLICY,
  loadCandidateAutomationPolicy,
  saveCandidateAutomationPolicy,
} from "@/lib/candidate-automation-engine/automation-policy-store";
export {
  createAutomationRunId,
  listCandidateAutomationRuns,
  recordCandidateAutomationRun,
} from "@/lib/candidate-automation-engine/automation-run-store";
export { buildCandidateAutomationHealth } from "@/lib/candidate-automation-engine/build-automation-health";
export { runCandidateAutomationEngine } from "@/lib/candidate-automation-engine/run-candidate-automation-engine";
