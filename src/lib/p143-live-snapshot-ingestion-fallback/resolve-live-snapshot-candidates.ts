import { getIngestedCandidatesSnapshot } from "@/lib/candidate-ingestion";
import type { BreezyCandidatesResult, BreezyCandidatesSuccess } from "@/lib/breezy-api";
import type {
  IngestionFallbackReason,
  LiveSnapshotCandidateMetadata,
  LiveSnapshotCandidateSource,
  LiveSnapshotIngestionFallbackRules,
} from "@/lib/p143-live-snapshot-ingestion-fallback/types";

export const LIVE_SNAPSHOT_INGESTION_UNDERCOUNT_RATIO = 2;

export const LIVE_SNAPSHOT_FALLBACK_RULES: LiveSnapshotIngestionFallbackRules = {
  undercountRatio: LIVE_SNAPSHOT_INGESTION_UNDERCOUNT_RATIO,
  useFallbackWhenPreviewEmpty: true,
  useFallbackWhenPreviewFailed: true,
  useFallbackWhenUndercountVsIngestion: true,
  useFallbackWhenServerBudget: true,
  useFallbackWhenPartialScan: true,
};

export type ResolveLiveSnapshotCandidatesInput = {
  previewResult: BreezyCandidatesResult;
  previewFromCache: boolean;
  ingestedSnapshot?: BreezyCandidatesSuccess | null;
};

export type ResolveLiveSnapshotCandidatesResult = {
  candidates: BreezyCandidatesSuccess;
  metadata: LiveSnapshotCandidateMetadata;
  usedIngestionFallback: boolean;
};

function previewCount(preview: BreezyCandidatesResult | null | undefined): number {
  return preview?.ok ? preview.candidates.length : 0;
}

function previewStoppedOnBudget(preview: BreezyCandidatesSuccess): boolean {
  return preview.previewDiagnostics?.previewStoppedReason === "server_budget";
}

export function evaluateIngestionFallback(input: {
  previewResult: BreezyCandidatesResult;
  previewFromCache: boolean;
  ingestionCount: number;
  rules?: LiveSnapshotIngestionFallbackRules;
}): { useFallback: boolean; reason: IngestionFallbackReason | null } {
  const rules = input.rules ?? LIVE_SNAPSHOT_FALLBACK_RULES;
  const preview = input.previewResult;
  const count = previewCount(preview);
  const ingestionCount = input.ingestionCount;

  if (ingestionCount <= 0) {
    return { useFallback: false, reason: null };
  }

  if (!preview.ok) {
    return rules.useFallbackWhenPreviewFailed
      ? { useFallback: true, reason: "preview_fetch_failed" }
      : { useFallback: false, reason: null };
  }

  if (count === 0) {
    if (!rules.useFallbackWhenPreviewEmpty) {
      return { useFallback: false, reason: null };
    }
    return {
      useFallback: true,
      reason: input.previewFromCache ? "cold_preview_cache" : "preview_empty",
    };
  }

  const undercounted = ingestionCount > count * rules.undercountRatio;
  const serverBudget = previewStoppedOnBudget(preview);
  const partial = preview.truncated === true || preview.partial === true;

  if (undercounted && rules.useFallbackWhenUndercountVsIngestion) {
    if (serverBudget && rules.useFallbackWhenServerBudget) {
      return { useFallback: true, reason: "preview_server_budget_undercount" };
    }
    if (partial && rules.useFallbackWhenPartialScan) {
      return { useFallback: true, reason: "preview_partial_undercount" };
    }
    return { useFallback: true, reason: "preview_undercount_vs_ingestion" };
  }

  return { useFallback: false, reason: null };
}

function annotateIngestionFallback(
  ingested: BreezyCandidatesSuccess,
  reason: IngestionFallbackReason,
  previewCountValue: number,
): BreezyCandidatesSuccess {
  return {
    ...ingested,
    source: "ingestion_fallback",
    sourcePath: "candidate-ingestion.json",
    syncNotes: [
      ...(ingested.syncNotes ?? []),
      `P143 live snapshot ingestion fallback (${reason}).`,
      previewCountValue > 0
        ? `Preview scan returned ${previewCountValue} candidate(s); serving ${ingested.candidates.length} from durable ingestion store.`
        : `Preview scan returned no candidates; serving ${ingested.candidates.length} from durable ingestion store.`,
    ],
  };
}

export async function resolveLiveSnapshotCandidates(
  input: ResolveLiveSnapshotCandidatesInput,
): Promise<ResolveLiveSnapshotCandidatesResult> {
  const ingested =
    input.ingestedSnapshot !== undefined
      ? input.ingestedSnapshot
      : await getIngestedCandidatesSnapshot();
  const ingestionCount = ingested?.candidates.length ?? 0;
  const previewCountValue = previewCount(input.previewResult);

  const decision = evaluateIngestionFallback({
    previewResult: input.previewResult,
    previewFromCache: input.previewFromCache,
    ingestionCount,
  });

  let candidateSource: LiveSnapshotCandidateSource;
  let candidates: BreezyCandidatesSuccess;
  let freshnessTimestamp: string;

  if (decision.useFallback && ingested) {
    candidateSource = previewCountValue > 0 ? "mixed" : "ingestion_fallback";
    candidates = annotateIngestionFallback(ingested, decision.reason!, previewCountValue);
    freshnessTimestamp = ingested.fetchedAt;
  } else if (input.previewResult.ok) {
    candidateSource = input.previewFromCache ? "live_cache" : "live_preview";
    candidates = input.previewResult;
    freshnessTimestamp = input.previewResult.fetchedAt;
  } else {
    candidateSource = "live_preview";
    candidates = {
      ok: true,
      candidates: [],
      fetchedAt: new Date().toISOString(),
      companyId: "",
    };
    freshnessTimestamp = candidates.fetchedAt;
  }

  const candidateCount = candidates.candidates.length;

  return {
    candidates,
    usedIngestionFallback: decision.useFallback,
    metadata: {
      candidateSource,
      candidateCount,
      ingestionCandidateCount: ingestionCount > 0 ? ingestionCount : null,
      previewCandidateCount: input.previewResult.ok ? previewCountValue : null,
      fallbackReason: decision.reason,
      candidatesFreshnessTimestamp: freshnessTimestamp,
    },
  };
}
