export { discoverCandidate } from "@/lib/p170-unified-candidate-discovery/discover-candidate";
export type { DiscoverCandidateOptions } from "@/lib/p170-unified-candidate-discovery/discover-candidate";
export { buildP170DiscoveryStatus } from "@/lib/p170-unified-candidate-discovery/build-discovery-status";
export { parseP170SearchQuery, normalizePhoneDigits } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
export {
  findInIngestionStore,
  matchesP170Query,
  resolveP170Candidate,
  toCandidateSummary,
} from "@/lib/p170-unified-candidate-discovery/search-candidates";
export {
  assertP170UsesExistingArchitecture,
  validateP170ReadOnly,
} from "@/lib/p170-unified-candidate-discovery/discovery-validation";
export {
  buildDiscoveryChecklist,
  formatP170Markdown,
  sourceLabel,
  sourceTone,
} from "@/lib/p170-unified-candidate-discovery/presentation";
export * from "@/lib/p170-unified-candidate-discovery/types";
