import type { BreezyCandidatesSuccess, BreezyJobsResult } from "@/lib/breezy-api";
import type { CandidateWorkflowState, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import { FETCH_T4_INTELLIGENCE_MS, fetchWithTimeout, isTimeoutError } from "@/lib/fetch-with-timeout";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

export type RecruitingCandidatesCenterMeta = {
  partialSync: boolean;
  scanMode: string | null;
  positionsScanned: number;
  totalPositionsAvailable: number;
  melOk: boolean;
  refreshedAt: string;
  intelligenceCache: RecruitingIntelligenceCacheMeta;
  hydrationViaDirectBreezy: boolean;
  hydrationNote: string;
};

export type RecruitingCandidatesCenterPayload = {
  candidatesResult: BreezyCandidatesSuccess;
  jobsResult: Extract<BreezyJobsResult, { ok: true }>;
  workflows: CandidateWorkflowState;
  rosters: RecruiterRosters;
  opportunities: MelOpportunity[];
  workflowUpdatedAt: string;
  meta: RecruitingCandidatesCenterMeta;
};

export type RecruitingCandidatesCenterResponse =
  | { ok: true; center: RecruitingCandidatesCenterPayload }
  | { ok: false; error: string; kind?: "jobs" | "candidates" };

const ROUTE = "/api/recruiting/candidates-center";

export async function fetchRecruitingCandidatesCenter(options?: {
  forceRefresh?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<RecruitingCandidatesCenterResponse> {
  const params = new URLSearchParams();
  if (options?.forceRefresh) params.set("forceRefresh", "1");
  const url = params.size ? `${ROUTE}?${params}` : ROUTE;
  const started = performance.now();
  logDashboardFetch("start", { route: url, label: "recruiting-candidates-center" });

  try {
    const res = await fetchWithTimeout(url, {
      cache: "no-store",
      timeoutMs: options?.timeoutMs ?? FETCH_T4_INTELLIGENCE_MS,
      signal: options?.signal,
    });
    const parsed = (await res.json()) as RecruitingCandidatesCenterResponse;
    logDashboardFetch(res.ok && parsed.ok ? "success" : "error", {
      route: url,
      label: "recruiting-candidates-center",
      ms: Math.round(performance.now() - started),
      status: res.status,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: "error" in parsed && typeof parsed.error === "string" ? parsed.error : res.statusText,
      };
    }
    return parsed;
  } catch (err) {
    const timedOut = isTimeoutError(err);
    logDashboardFetch(timedOut ? "timeout" : "error", {
      route: url,
      label: "recruiting-candidates-center",
      ms: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : "fetch failed",
    });
    throw err;
  }
}
