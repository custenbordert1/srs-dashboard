export {
  P192_SOURCE_PHASE,
  P192_SCHEMA_VERSION,
  P192_INTERVAL_MS,
  P192_MAX_SENDS_PER_CYCLE,
  P192_MAX_FAILURES_PER_CYCLE,
  P192_RATE_LIMITS,
} from "@/lib/p192-supervised-paperwork-runner/types";
export type {
  P192RunnerPhase,
  P192CycleSummary,
  P192RunnerStatus,
  P192PreflightResult,
} from "@/lib/p192-supervised-paperwork-runner/types";

export { evaluateP192Eligibility, assertNoUpstreamAutomation } from "@/lib/p192-supervised-paperwork-runner/eligibility";
export type { P192EligibilityResult } from "@/lib/p192-supervised-paperwork-runner/eligibility";

export {
  writeP192Status,
  readP192Status,
  acquireP192ProcessLock,
  releaseP192ProcessLock,
  requestP192Stop,
  clearP192StopRequest,
  isP192StopRequested,
} from "@/lib/p192-supervised-paperwork-runner/control";

export { runP192Preflight } from "@/lib/p192-supervised-paperwork-runner/preflight";
export { runP192Cycle } from "@/lib/p192-supervised-paperwork-runner/cycle";
export {
  startP192SupervisedRunner,
  runP192Once,
  stopP192SupervisedRunner,
} from "@/lib/p192-supervised-paperwork-runner/runner";
export {
  applyP192ProductionDropboxEnv,
  assertProductionTestModeOff,
  enableP192LivePaperworkModes,
  restoreP192SafeModes,
  readP192DropboxTestMode,
} from "@/lib/p192-supervised-paperwork-runner/productionMode";
