export { P185_1_SOURCE_PHASE, P185_1_OPERATOR } from "@/lib/p185-1-paperwork-eligibility-recovery/types";
export type * from "@/lib/p185-1-paperwork-eligibility-recovery/types";

export { resolveP1851JobMapping, mappingMethodRank } from "@/lib/p185-1-paperwork-eligibility-recovery/jobMapping";
export {
  normalizeP1851Stage,
  inventoryDistinctStages,
  P1851_STAGE_MAPPING_TABLE,
} from "@/lib/p185-1-paperwork-eligibility-recovery/stageNormalization";
export { collectP1851HiringEvidence } from "@/lib/p185-1-paperwork-eligibility-recovery/hiringEvidence";
export { classifyP1851PaperworkNeed } from "@/lib/p185-1-paperwork-eligibility-recovery/classifier";
export {
  reconcileP1851Envelopes,
  mapDropboxSummaryToP1851Lifecycle,
  isReplacementEligibleLifecycle,
} from "@/lib/p185-1-paperwork-eligibility-recovery/envelopeReconcile";
export { loadP1851OperatorEvidence } from "@/lib/p185-1-paperwork-eligibility-recovery/operatorQueues";
export {
  loadP1851RecoveryState,
  saveP1851RecoveryState,
  upsertP1851MappingAliases,
  resetP1851StateMemoryForTests,
} from "@/lib/p185-1-paperwork-eligibility-recovery/store";
export { runP1851PaperworkEligibilityRecovery } from "@/lib/p185-1-paperwork-eligibility-recovery/recovery";
export type { P1851RecoveryRunResult } from "@/lib/p185-1-paperwork-eligibility-recovery/recovery";
export {
  formatP1851Markdown,
  P1851_SECRET_SETUP_DOC,
} from "@/lib/p185-1-paperwork-eligibility-recovery/report";
