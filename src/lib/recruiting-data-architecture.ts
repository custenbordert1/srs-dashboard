/**
 * Recruiting data source architecture — Breezy is live; Google Sheet recruiting is archive/reference.
 *
 * Source map (audit):
 * | Domain              | Live (primary)     | Intelligence overlay | Archive only        |
 * |---------------------|--------------------|----------------------|---------------------|
 * | Job ads             | Breezy API + cache | job-drafts.json      | recruiting-sheet    |
 * | Candidates          | Breezy API + cache | candidate-workflows  | —                   |
 * | Applicant counts    | Breezy per job     | —                    | sheet column        |
 * | Workflow buckets    | local .data JSON   | —                    | —                   |
 * | MEL / store demand  | MEL Google Sheet   | —                    | —                   |
 * | Overview mock jobs  | DEPRECATED         | —                    | recruiting-sample   |
 * | Rep roster          | workforce CSV      | active-reps.json     | —                   |
 */

export type RecruitingDataSourceKind =
  | "breezy_api"
  | "breezy_cache"
  | "local_workflow"
  | "local_draft"
  | "google_sheet_recruiting"
  | "google_sheet_mel"
  | "mock_sample"
  | "workforce_store";

export type RecruitingSourceRole = "live" | "intelligence" | "archive" | "deprecated";

export type RecruitingSourceDefinition = {
  id: string;
  label: string;
  kind: RecruitingDataSourceKind;
  role: RecruitingSourceRole;
  apiPath?: string;
  notes: string;
};

/** Canonical source-of-truth registry for diagnostics and docs. */
export const RECRUITING_SOURCE_MAP: RecruitingSourceDefinition[] = [
  {
    id: "breezy_jobs",
    label: "Breezy published jobs",
    kind: "breezy_api",
    role: "live",
    apiPath: "/api/breezy/jobs",
    notes: "Active job ads, applicant counts on position payload",
  },
  {
    id: "breezy_candidates",
    label: "Breezy candidates",
    kind: "breezy_api",
    role: "live",
    apiPath: "/api/breezy/candidates",
    notes: "Fast published scan with 60s server cache",
  },
  {
    id: "recruiting_live_snapshot",
    label: "Recruiting live snapshot",
    kind: "breezy_cache",
    role: "live",
    apiPath: "/api/recruiting/live-snapshot",
    notes: "Unified Breezy jobs + candidates + cache diagnostics",
  },
  {
    id: "candidate_workflows",
    label: "Candidate workflows",
    kind: "local_workflow",
    role: "intelligence",
    apiPath: "/api/candidates/workflows",
    notes:
      "Local workflow, recruiting action flags, and recruiter/DM rosters keyed by Breezy candidateId",
  },
  {
    id: "job_drafts",
    label: "Job drafts",
    kind: "local_draft",
    role: "intelligence",
    apiPath: "/api/job-management/drafts",
    notes: "Clone/push drafts; not live until pushed to Breezy",
  },
  {
    id: "recruiting_sheet",
    label: "Recruiting Google Sheet",
    kind: "google_sheet_recruiting",
    role: "archive",
    apiPath: "/api/recruiting-sheet",
    notes: "Reference/export only — not used for live job/candidate counts when Breezy primary",
  },
  {
    id: "mel_sheet",
    label: "MEL projects sheet",
    kind: "google_sheet_mel",
    role: "live",
    apiPath: "/api/mel-projects",
    notes: "Store-call demand — separate from ATS recruiting",
  },
  {
    id: "sample_data",
    label: "Sample / mock charts",
    kind: "mock_sample",
    role: "deprecated",
    notes: "recruiting-sample-data.ts — removed from live Overview",
  },
];

const STALE_CACHE_MS = 5 * 60 * 1000;
const WARN_CACHE_MS = 2 * 60 * 1000;

/**
 * When false (default), recruiting Google Sheet must not drive live jobs/candidates/KPIs.
 * Set RECRUITING_SHEET_LIVE_SOURCE=true only for legacy comparison.
 */
export function isGoogleSheetRecruitingLiveEnabled(): boolean {
  return process.env.RECRUITING_SHEET_LIVE_SOURCE === "true";
}

/** Client-visible flag (must match server policy). */
export function isGoogleSheetRecruitingLiveEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_RECRUITING_SHEET_LIVE_SOURCE === "true";
}

export function getPrimaryRecruitingSourceLabel(): string {
  return isGoogleSheetRecruitingLiveEnabled()
    ? "Hybrid (legacy sheet + Breezy)"
    : "Breezy HR (live)";
}

export type RecruitingCacheDiagnostics = {
  jobsFetchedAt: string | null;
  candidatesFetchedAt: string | null;
  jobsFromCache: boolean;
  candidatesFromCache: boolean;
  jobsCacheAgeMs: number | null;
  candidatesCacheAgeMs: number | null;
  staleWarning: string | null;
};

export function buildCacheDiagnostics(input: {
  jobsFetchedAt: string | null;
  candidatesFetchedAt: string | null;
  jobsFromCache: boolean;
  candidatesFromCache: boolean;
  breezyConfigured: boolean;
  jobsOk: boolean;
  candidatesOk: boolean;
  jobsError?: string;
  candidatesError?: string;
}): RecruitingCacheDiagnostics {
  const now = Date.now();
  const jobsAge = input.jobsFetchedAt
    ? now - new Date(input.jobsFetchedAt).getTime()
    : null;
  const candidatesAge = input.candidatesFetchedAt
    ? now - new Date(input.candidatesFetchedAt).getTime()
    : null;

  const warnings: string[] = [];
  if (!input.breezyConfigured) {
    warnings.push("Breezy API key not configured — live recruiting data unavailable.");
  }
  if (!input.jobsOk && input.jobsError) warnings.push(`Jobs: ${input.jobsError}`);
  if (!input.candidatesOk && input.candidatesError) {
    warnings.push(`Candidates: ${input.candidatesError}`);
  }
  if (jobsAge !== null && jobsAge > STALE_CACHE_MS) {
    warnings.push(`Breezy jobs cache is stale (${Math.round(jobsAge / 1000)}s). Refresh recommended.`);
  }
  if (candidatesAge !== null && candidatesAge > STALE_CACHE_MS) {
    warnings.push(
      `Breezy candidates cache is stale (${Math.round(candidatesAge / 1000)}s). Refresh recommended.`,
    );
  }
  if (
    input.candidatesFromCache &&
    candidatesAge !== null &&
    candidatesAge > WARN_CACHE_MS &&
    candidatesAge <= STALE_CACHE_MS
  ) {
    warnings.push("Serving warmed Breezy candidate cache; background refresh may be in progress.");
  }

  return {
    jobsFetchedAt: input.jobsFetchedAt,
    candidatesFetchedAt: input.candidatesFetchedAt,
    jobsFromCache: input.jobsFromCache,
    candidatesFromCache: input.candidatesFromCache,
    jobsCacheAgeMs: jobsAge,
    candidatesCacheAgeMs: candidatesAge,
    staleWarning: warnings.length > 0 ? warnings.join(" ") : null,
  };
}
