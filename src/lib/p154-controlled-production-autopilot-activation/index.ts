export {
  executeControlledProductionAutopilot,
  getP154MaxAssignmentsPerCycle,
  getP154MaxSendsPerCycle,
  isP154ControlledProductionAutopilotEnabled,
} from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
export {
  defaultAutopilotEnabledFeatures,
  loadAutopilotState,
  saveAutopilotState,
} from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
export { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";
export { formatP154ProductionAutopilotMarkdown } from "@/lib/p154-controlled-production-autopilot-activation/format-p154-markdown";
export type {
  AutopilotDashboardMetrics,
  AutopilotDependencyCheck,
  AutopilotEnabledFeatures,
  AutopilotState,
  AutopilotSystemHealthReport,
  ControlledProductionAutopilotCycleReport,
} from "@/lib/p154-controlled-production-autopilot-activation/types";
export {
  P154_DEFAULT_MAX_ASSIGNMENTS,
  P154_DEFAULT_MAX_SENDS,
  P154_SOURCE_PHASE,
} from "@/lib/p154-controlled-production-autopilot-activation/types";
