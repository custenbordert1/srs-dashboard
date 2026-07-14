export { readP1882Flags, type P1882Flags } from "@/lib/p188-2-breezy-enrichment-recovery/flags";
export {
  buildEnrichmentBundle,
  buildJobsCatalogFromSources,
  extractBreezyAssignee,
  indexApprovedMappings,
  indexExecutedAssignmentAudits,
  isEvidenceStale,
  type P1882EnrichmentBundle,
} from "@/lib/p188-2-breezy-enrichment-recovery/sources";
export { resolveRecruiterEnrichment } from "@/lib/p188-2-breezy-enrichment-recovery/recruiterEnrichment";
export { resolveJobEnrichment } from "@/lib/p188-2-breezy-enrichment-recovery/jobEnrichment";
export {
  refuseProductionEnrichmentWrite,
  runP1882EnrichmentPipeline,
  type P1882PipelineResult,
} from "@/lib/p188-2-breezy-enrichment-recovery/pipeline";
export { loadP1882EnrichmentBundleFromLocal } from "@/lib/p188-2-breezy-enrichment-recovery/loadLocal";
export * from "@/lib/p188-2-breezy-enrichment-recovery/types";
