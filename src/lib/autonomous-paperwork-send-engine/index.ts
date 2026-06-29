export { P84_SOURCE_PHASE } from "@/lib/autonomous-paperwork-send-engine/types";
export type {
  P84FeatureFlags,
  PaperworkSendAuditEvent,
  PaperworkSendDashboardMetrics,
  PaperworkSendDecision,
  PaperworkSendEligibilityResult,
  PaperworkSendGate,
  PaperworkSendGateId,
  PaperworkSendRunResult,
} from "@/lib/autonomous-paperwork-send-engine/types";

export {
  DEFAULT_P84_FEATURE_FLAGS,
  canLiveSendPaperwork,
  loadP84FeatureFlags,
  resolveP84FeatureFlagsFromEnv,
  saveP84FeatureFlags,
} from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
export {
  buildPaperworkSendDecisions,
  buildPaperworkSendEligibility,
} from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
export {
  appendPaperworkSendAuditEvent,
  buildPaperworkSendAuditEventId,
  loadPaperworkSendAuditLog,
} from "@/lib/autonomous-paperwork-send-engine/audit-log-store";
export { buildPaperworkRetryPlan } from "@/lib/autonomous-paperwork-send-engine/retry-engine";
export type { PaperworkRetryPlan } from "@/lib/autonomous-paperwork-send-engine/retry-engine";
export { prepareOnboardingSend } from "@/lib/autonomous-paperwork-send-engine/prepare-onboarding-send";
export {
  countEligiblePaperworkSends,
  estimateImmediatePaperworkSends,
  runAutonomousPaperworkSend,
} from "@/lib/autonomous-paperwork-send-engine/run-autonomous-paperwork-send";
export { runSignatureMonitoring } from "@/lib/autonomous-paperwork-send-engine/run-signature-monitoring";
export { buildP84DashboardMetrics } from "@/lib/autonomous-paperwork-send-engine/build-p84-dashboard-metrics";
