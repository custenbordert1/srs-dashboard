export {
  P204_SOURCE_PHASE,
  P204_SCHEMA_VERSION,
} from "@/lib/p204-ai-candidate-qualification/types";
export type {
  P204QualificationDecision,
  P204Recommendation,
  P204ReasonCode,
  P204SimulationReport,
} from "@/lib/p204-ai-candidate-qualification/types";

export {
  buildEmailDuplicateIndex,
  evaluateP204Qualification,
} from "@/lib/p204-ai-candidate-qualification/decide";

export {
  runP204QualificationSimulation,
  type P204SimulationResult,
} from "@/lib/p204-ai-candidate-qualification/simulate";
