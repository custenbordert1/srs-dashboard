export type {
  AutomationBlockers,
  CandidateGateTrace,
  FunnelGate,
  FunnelReadinessAudit,
  GateFailureCounts,
  GateFailureReason,
  RecruiterReplacementReadiness,
  ReplacementReadinessScore,
} from "@/lib/recruiter-replacement-readiness/types";
export { buildRecruiterReplacementReadiness } from "@/lib/recruiter-replacement-readiness/build-recruiter-replacement-readiness";
export {
  countPaperworkEligible,
  GATE_ORDER,
  traceCandidateFunnelGate,
} from "@/lib/recruiter-replacement-readiness/trace-funnel-gates";
