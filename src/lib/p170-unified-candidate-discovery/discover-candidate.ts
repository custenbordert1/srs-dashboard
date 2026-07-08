import { buildP170DiscoveryStatus } from "@/lib/p170-unified-candidate-discovery/build-discovery-status";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import {
  resolveP170Candidate,
  toCandidateSummary,
} from "@/lib/p170-unified-candidate-discovery/search-candidates";
import {
  P170_SOURCE_PHASE,
  type P170SearchResult,
} from "@/lib/p170-unified-candidate-discovery/types";

export type DiscoverCandidateOptions = {
  /** Skip the P157/P169 discovery checklist (faster, search-only). */
  skipDiscoveryStatus?: boolean;
};

/**
 * Unified server-side candidate discovery.
 * Query order: durable ingestion store → P153.2 lookup rescue.
 * Always read-only: no Breezy writes, no paperwork, no full index rebuild.
 */
export async function discoverCandidate(
  rawQuery: string,
  options: DiscoverCandidateOptions = {},
): Promise<P170SearchResult> {
  const query = parseP170SearchQuery(rawQuery);
  const generatedAt = new Date().toISOString();

  if (!query.raw) {
    return {
      sourcePhase: P170_SOURCE_PHASE,
      generatedAt,
      readOnly: true,
      query,
      found: false,
      source: null,
      rescueInvoked: false,
      rescueSource: null,
      hydratedIntoStore: false,
      candidate: null,
      discovery: null,
      warnings: ["Empty search query."],
    };
  }

  const resolved = await resolveP170Candidate(rawQuery);

  if (!resolved.candidate) {
    return {
      sourcePhase: P170_SOURCE_PHASE,
      generatedAt,
      readOnly: true,
      query,
      found: false,
      source: null,
      rescueInvoked: resolved.rescueInvoked,
      rescueSource: resolved.rescueSource,
      hydratedIntoStore: resolved.hydratedIntoStore,
      candidate: null,
      discovery: null,
      warnings: resolved.warnings,
    };
  }

  const discovery = options.skipDiscoveryStatus
    ? null
    : await buildP170DiscoveryStatus({
        candidate: resolved.candidate,
        foundInIngestion: resolved.foundInIngestion,
      });

  return {
    sourcePhase: P170_SOURCE_PHASE,
    generatedAt,
    readOnly: true,
    query,
    found: true,
    source: resolved.source,
    rescueInvoked: resolved.rescueInvoked,
    rescueSource: resolved.rescueSource,
    hydratedIntoStore: resolved.hydratedIntoStore,
    candidate: toCandidateSummary(resolved.candidate),
    discovery,
    warnings: resolved.warnings,
  };
}
