export {
  P229_BATCH_OPTIONS,
  P229_CATEGORIES,
  P229_CATEGORY_LABELS,
  P229_EXECUTION_MODE,
  P229_PHASE,
  P229_ROUTING_BLOCKERS,
  P229_SCHEMA_VERSION,
} from "@/lib/p229-routing-recovery-analysis/types";
export type {
  P229AnalysisResult,
  P229BatchFeasibility,
  P229BatchSize,
  P229CandidateOpportunity,
  P229Category,
  P229CategoryCounts,
  P229CoverageProposal,
  P229DmProposal,
  P229EligibilitySimulation,
  P229LocationProposal,
  P229MarketRow,
  P229OperationalImpact,
  P229RecoveryCapability,
  P229RoutingBlocker,
  P229RoutingScoreSnapshot,
  P229StateMarketRow,
} from "@/lib/p229-routing-recovery-analysis/types";

export {
  applyP229SimulatedSnapshot,
  buildP229Opportunity,
  classifyP229Opportunity,
  emptyCategoryCounts,
  extractRoutingBlockers,
  pickPrimaryCategory,
  recoveryCapabilityFor,
} from "@/lib/p229-routing-recovery-analysis/classify";
export type { P229ClassifyInput } from "@/lib/p229-routing-recovery-analysis/classify";

export {
  proposeP229Coverage,
  proposeP229Dm,
  proposeP229Location,
  simulateP229Eligibility,
} from "@/lib/p229-routing-recovery-analysis/simulate";
export type { P229LocationEvidence } from "@/lib/p229-routing-recovery-analysis/simulate";

export {
  analyzeP229Markets,
  buildP229EngineeringPriorities,
  computeP229RoutingScore,
  countRoutingBlockers,
  estimateP229OperationalImpact,
} from "@/lib/p229-routing-recovery-analysis/metrics";

export { formatP229MarkdownReport } from "@/lib/p229-routing-recovery-analysis/format-report";
