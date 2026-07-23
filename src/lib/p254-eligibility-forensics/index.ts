export {
  P254_PHASE,
  P254_OPS_DATE,
  P254_SOURCE_ARTIFACT,
  P254_FAILURE_GROUPS,
  P254_RECOVERABLE_ISSUES,
} from "@/lib/p254-eligibility-forensics/types";

export type {
  P254FailureGroup,
  P254RecoverableIssue,
  P254CandidateForensic,
  P254FailureGroupBucket,
  P254RecoverableImpact,
  P254Totals,
  P254MissionResult,
} from "@/lib/p254-eligibility-forensics/types";

export {
  classifyP254FailureGroup,
  buildP254CandidateForensic,
  buildP254FailureGroups,
  buildP254RecoverableImpact,
  buildP254ComboRecoverableImpact,
  buildP254Totals,
  isAutomaticallyRecoverable,
  wouldBecomeEligibleIfBlockersRemoved,
} from "@/lib/p254-eligibility-forensics/classify";

export { formatP254EligibilityForensicsMarkdown } from "@/lib/p254-eligibility-forensics/format";
export { runP254EligibilityForensics } from "@/lib/p254-eligibility-forensics/run";
