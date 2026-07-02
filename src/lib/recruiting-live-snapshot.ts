import { getBreezyApiKeySync, loadConfigSync } from "@/lib/config";
import { breezyConfigErrorMessage } from "@/lib/env-validation";
import {
  fetchBreezyCandidates,
  fetchBreezyJobs,
  peekBreezyCandidatesCache,
  type BreezyCandidatesResult,
  type BreezyJobsResult,
} from "@/lib/breezy-api";
import {
  buildBreezyJobLocationDiagnostics,
  type BreezyJobLocationDiagnostics,
} from "@/lib/breezy-job-location";
import {
  buildCacheDiagnostics,
  getPrimaryRecruitingSourceLabel,
  isGoogleSheetRecruitingLiveEnabled,
  type RecruitingCacheDiagnostics,
} from "@/lib/recruiting-data-architecture";
import {
  computeBreezyKpiSnapshot,
  computeRecruitingIntelligenceFromBreezy,
} from "@/lib/recruiting-breezy-adapters";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence";
import { resolveLiveSnapshotCandidates } from "@/lib/p143-live-snapshot-ingestion-fallback/resolve-live-snapshot-candidates";
import type { LiveSnapshotCandidateMetadata } from "@/lib/p143-live-snapshot-ingestion-fallback/types";
import type { SheetKpiSnapshot } from "@/lib/sheet-kpi-metrics";

export type RecruitingLiveSnapshotSyncStatus =
  | "ready"
  | "partial"
  | "cache_only"
  | "fallback"
  | "unavailable";

export type RecruitingLiveSnapshot = {
  ok: true;
  primarySource: string;
  sheetLiveEnabled: boolean;
  jobs: BreezyJobsResult & { ok: true };
  candidates: BreezyCandidatesResult & { ok: true };
  intelligence: RecruitingIntelligenceSnapshot;
  kpiSnapshot: SheetKpiSnapshot;
  diagnostics: RecruitingCacheDiagnostics;
  jobLocationDiagnostics: BreezyJobLocationDiagnostics;
  syncStatus: RecruitingLiveSnapshotSyncStatus;
  fetchedAt: string;
  candidateSource: LiveSnapshotCandidateMetadata["candidateSource"];
  candidateCount: number;
  ingestionCandidateCount: number | null;
  previewCandidateCount: number | null;
  fallbackReason: LiveSnapshotCandidateMetadata["fallbackReason"];
  candidatesFreshnessTimestamp: string;
};

export type RecruitingLiveSnapshotFailure = {
  ok: false;
  error: string;
  primarySource: string;
  sheetLiveEnabled: boolean;
  diagnostics: RecruitingCacheDiagnostics;
  /** Cached Breezy data when live fetch fails — never sheet fallback. */
  fallback?: {
    jobs: BreezyJobsResult | null;
    candidates: BreezyCandidatesResult | null;
  };
  fetchedAt: string;
};

export type RecruitingLiveSnapshotResult = RecruitingLiveSnapshot | RecruitingLiveSnapshotFailure;

async function buildSuccessSnapshot(input: {
  jobs: BreezyJobsResult & { ok: true };
  previewCandidates: BreezyCandidatesResult;
  previewFromCache: boolean;
  jobsFromCache: boolean;
  primarySource: string;
  sheetLiveEnabled: boolean;
  fetchedAt: string;
  syncStatus?: RecruitingLiveSnapshotSyncStatus;
}): Promise<RecruitingLiveSnapshot> {
  const resolved = await resolveLiveSnapshotCandidates({
    previewResult: input.previewCandidates,
    previewFromCache: input.previewFromCache,
  });

  const candidatesFromCache = input.previewFromCache && !resolved.usedIngestionFallback;
  const syncStatus =
    input.syncStatus ??
    (resolved.usedIngestionFallback
      ? "fallback"
      : input.previewFromCache
        ? "cache_only"
        : "ready");

  return successSnapshot({
    jobs: input.jobs,
    candidates: resolved.candidates,
    candidateMetadata: resolved.metadata,
    jobsFromCache: input.jobsFromCache,
    candidatesFromCache,
    primarySource: input.primarySource,
    sheetLiveEnabled: input.sheetLiveEnabled,
    fetchedAt: input.fetchedAt,
    syncStatus,
  });
}

export async function buildRecruitingLiveSnapshot(options?: {
  force?: boolean;
}): Promise<RecruitingLiveSnapshotResult> {
  loadConfigSync();
  const fetchedAt = new Date().toISOString();
  const breezyConfigured = Boolean(getBreezyApiKeySync());
  const sheetLiveEnabled = isGoogleSheetRecruitingLiveEnabled();
  const primarySource = getPrimaryRecruitingSourceLabel();

  const peekedCandidates = peekBreezyCandidatesCache({ scanMode: "preview" });

  if (!breezyConfigured) {
    return {
      ok: false,
      error: breezyConfigErrorMessage(),
      primarySource,
      sheetLiveEnabled,
      diagnostics: buildCacheDiagnostics({
        jobsFetchedAt: null,
        candidatesFetchedAt: peekedCandidates?.fetchedAt ?? null,
        jobsFromCache: false,
        candidatesFromCache: Boolean(peekedCandidates),
        breezyConfigured: false,
        jobsOk: false,
        candidatesOk: Boolean(peekedCandidates?.ok),
        jobsError: "Not configured",
        candidatesError: peekedCandidates ? undefined : "Not configured",
      }),
      fallback: peekedCandidates
        ? { jobs: null, candidates: peekedCandidates }
        : undefined,
      fetchedAt,
    };
  }

  if (options?.force) {
    const [jobsResult, candidatesResult] = await Promise.all([
      fetchBreezyJobs("published"),
      fetchBreezyCandidates({ scanMode: "preview", force: true }),
    ]);

    if (!jobsResult.ok && !candidatesResult.ok && !peekedCandidates) {
      const errMsg = !jobsResult.ok
        ? jobsResult.error
        : !candidatesResult.ok
          ? candidatesResult.error
          : "Breezy sync failed";
      return {
        ok: false,
        error: errMsg,
        primarySource,
        sheetLiveEnabled,
        diagnostics: buildCacheDiagnostics({
          jobsFetchedAt: jobsResult.fetchedAt,
          candidatesFetchedAt: candidatesResult.fetchedAt,
          jobsFromCache: false,
          candidatesFromCache: false,
          breezyConfigured: true,
          jobsOk: false,
          candidatesOk: false,
          jobsError: jobsResult.error,
          candidatesError: candidatesResult.error,
        }),
        fetchedAt,
      };
    }

    const jobs =
      jobsResult.ok
        ? jobsResult
        : peekedCandidates
          ? ({ ok: true, jobs: [], fetchedAt, companyId: "", state: "published" } as BreezyJobsResult & {
              ok: true;
            })
          : null;
    const previewCandidates = candidatesResult.ok ? candidatesResult : peekedCandidates ?? candidatesResult;

    if (!jobs?.ok) {
      return {
        ok: false,
        error: "Breezy sync incomplete — using cache where available.",
        primarySource,
        sheetLiveEnabled,
        diagnostics: buildCacheDiagnostics({
          jobsFetchedAt: jobsResult.ok ? jobsResult.fetchedAt : null,
          candidatesFetchedAt: candidatesResult.ok
            ? candidatesResult.fetchedAt
            : peekedCandidates?.fetchedAt ?? null,
          jobsFromCache: !jobsResult.ok,
          candidatesFromCache: !candidatesResult.ok,
          breezyConfigured: true,
          jobsOk: jobsResult.ok,
          candidatesOk: candidatesResult.ok || Boolean(peekedCandidates?.ok),
          jobsError: jobsResult.ok ? undefined : jobsResult.error,
          candidatesError: candidatesResult.ok ? undefined : candidatesResult.error,
        }),
        fallback: {
          jobs: null,
          candidates: previewCandidates.ok ? previewCandidates : peekedCandidates,
        },
        fetchedAt,
      };
    }

    return buildSuccessSnapshot({
      jobs,
      previewCandidates,
      previewFromCache: !candidatesResult.ok && Boolean(peekedCandidates),
      jobsFromCache: false,
      primarySource,
      sheetLiveEnabled,
      fetchedAt,
      syncStatus: candidatesResult.ok ? undefined : "partial",
    });
  }

  const [jobsResult, candidatesResult] = await Promise.all([
    fetchBreezyJobs("published"),
    peekedCandidates
      ? Promise.resolve(peekedCandidates)
      : fetchBreezyCandidates({ scanMode: "preview" }),
  ]);

  const jobsOk = jobsResult.ok;
  const candidatesOk = candidatesResult.ok;
  const usedPeek = Boolean(peekedCandidates);

  if (!jobsOk && !candidatesOk) {
    const errMsg = !jobsResult.ok
      ? jobsResult.error
      : !candidatesResult.ok
        ? candidatesResult.error
        : "Breezy unavailable";
    return {
      ok: false,
      error: errMsg,
      primarySource,
      sheetLiveEnabled,
      diagnostics: buildCacheDiagnostics({
        jobsFetchedAt: null,
        candidatesFetchedAt: null,
        jobsFromCache: false,
        candidatesFromCache: false,
        breezyConfigured: true,
        jobsOk: false,
        candidatesOk: false,
        jobsError: jobsResult.ok ? undefined : jobsResult.error,
        candidatesError: candidatesResult.ok ? undefined : candidatesResult.error,
      }),
      fetchedAt,
    };
  }

  const partialJobs = jobsOk
    ? jobsResult
    : ({ ok: true, jobs: [], fetchedAt, companyId: "", state: "published" } as BreezyJobsResult & {
        ok: true;
      });

  return buildSuccessSnapshot({
    jobs: partialJobs,
    previewCandidates: candidatesResult,
    previewFromCache: usedPeek,
    jobsFromCache: !jobsOk,
    primarySource,
    sheetLiveEnabled,
    fetchedAt,
    syncStatus: !jobsOk || !candidatesOk ? "partial" : usedPeek ? "cache_only" : undefined,
  });
}

function successSnapshot(input: {
  jobs: BreezyJobsResult & { ok: true };
  candidates: BreezyCandidatesResult & { ok: true };
  candidateMetadata: LiveSnapshotCandidateMetadata;
  jobsFromCache: boolean;
  candidatesFromCache: boolean;
  primarySource: string;
  sheetLiveEnabled: boolean;
  fetchedAt: string;
  syncStatus?: RecruitingLiveSnapshotSyncStatus;
}): RecruitingLiveSnapshot {
  const intelligence = computeRecruitingIntelligenceFromBreezy(
    input.jobs.jobs,
    input.candidates.candidates,
  );
  const kpiSnapshot = computeBreezyKpiSnapshot(input.jobs.jobs, input.candidates.candidates);

  const diagnostics = buildCacheDiagnostics({
    jobsFetchedAt: input.jobs.fetchedAt,
    candidatesFetchedAt: input.candidates.fetchedAt,
    jobsFromCache: input.jobsFromCache,
    candidatesFromCache: input.candidatesFromCache,
    breezyConfigured: true,
    jobsOk: true,
    candidatesOk: true,
  });

  const jobLocationDiagnostics =
    input.jobs.locationDiagnostics ??
    buildBreezyJobLocationDiagnostics(input.jobs.jobs);

  return {
    ok: true,
    primarySource: input.primarySource,
    sheetLiveEnabled: input.sheetLiveEnabled,
    jobs: input.jobs,
    candidates: input.candidates,
    intelligence,
    kpiSnapshot,
    diagnostics,
    jobLocationDiagnostics,
    syncStatus: input.syncStatus ?? "ready",
    fetchedAt: input.fetchedAt,
    candidateSource: input.candidateMetadata.candidateSource,
    candidateCount: input.candidateMetadata.candidateCount,
    ingestionCandidateCount: input.candidateMetadata.ingestionCandidateCount,
    previewCandidateCount: input.candidateMetadata.previewCandidateCount,
    fallbackReason: input.candidateMetadata.fallbackReason,
    candidatesFreshnessTimestamp: input.candidateMetadata.candidatesFreshnessTimestamp,
  };
}
