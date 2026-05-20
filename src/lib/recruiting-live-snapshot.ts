import { getBreezyApiKeySync, loadConfigSync } from "@/lib/config";
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
import type { SheetKpiSnapshot } from "@/lib/sheet-kpi-metrics";

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
  syncStatus: "ready" | "partial" | "cache_only" | "unavailable";
  fetchedAt: string;
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

export async function buildRecruitingLiveSnapshot(options?: {
  force?: boolean;
}): Promise<RecruitingLiveSnapshotResult> {
  loadConfigSync();
  const fetchedAt = new Date().toISOString();
  const breezyConfigured = Boolean(getBreezyApiKeySync());
  const sheetLiveEnabled = isGoogleSheetRecruitingLiveEnabled();
  const primarySource = getPrimaryRecruitingSourceLabel();

  const peekedCandidates = peekBreezyCandidatesCache();

  if (!breezyConfigured) {
    return {
      ok: false,
      error: "Breezy API key is not configured.",
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
      fetchBreezyCandidates(),
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
      jobsResult.ok ? jobsResult : peekedCandidates ? ({ ok: true, jobs: [], fetchedAt, companyId: "", state: "published" } as BreezyJobsResult & { ok: true }) : null;
    const candidates =
      candidatesResult.ok
        ? candidatesResult
        : peekedCandidates ?? null;

    if (!jobs?.ok || !candidates?.ok) {
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
          jobs: jobs?.ok ? jobs : null,
          candidates: candidates?.ok ? candidates : peekedCandidates,
        },
        fetchedAt,
      };
    }

    return successSnapshot({
      jobs,
      candidates,
      jobsFromCache: false,
      candidatesFromCache: false,
      primarySource,
      sheetLiveEnabled,
      fetchedAt,
    });
  }

  const [jobsResult, candidatesResult] = await Promise.all([
    fetchBreezyJobs("published"),
    peekedCandidates ? Promise.resolve(peekedCandidates) : fetchBreezyCandidates(),
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

  if (!jobsOk || !candidatesOk) {
    const partialJobs = jobsOk
      ? jobsResult
      : ({ ok: true, jobs: [], fetchedAt, companyId: "", state: "published" } as BreezyJobsResult & {
          ok: true;
        });
    const partialCandidates = candidatesOk
      ? candidatesResult
      : ({ ok: true, candidates: [], fetchedAt, companyId: "" } as BreezyCandidatesResult & { ok: true });

    return successSnapshot({
      jobs: partialJobs,
      candidates: partialCandidates,
      jobsFromCache: !jobsOk,
      candidatesFromCache: usedPeek || !candidatesResult.ok,
      primarySource,
      sheetLiveEnabled,
      fetchedAt,
      syncStatus: "partial",
    });
  }

  return successSnapshot({
    jobs: jobsResult,
    candidates: candidatesResult,
    jobsFromCache: false,
    candidatesFromCache: usedPeek,
    primarySource,
    sheetLiveEnabled,
    fetchedAt,
    syncStatus: usedPeek ? "cache_only" : "ready",
  });
}

function successSnapshot(input: {
  jobs: BreezyJobsResult & { ok: true };
  candidates: BreezyCandidatesResult & { ok: true };
  jobsFromCache: boolean;
  candidatesFromCache: boolean;
  primarySource: string;
  sheetLiveEnabled: boolean;
  fetchedAt: string;
  syncStatus?: RecruitingLiveSnapshot["syncStatus"];
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
  };
}
