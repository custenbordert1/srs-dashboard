"use client";

import {
  breezyAtsSyncTierLabel,
  buildBreezyAtsMetrics,
  formatBreezyAtsStatusHeadline,
  type BreezyAtsMetrics,
} from "@/lib/breezy-ats-metrics";
import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { peekTabCandidatesCache } from "@/lib/breezy-candidates-client";
import { cacheKey, getCachedAllowExpired } from "@/lib/client-api-cache";
import { DataHealthRequestTimeoutError, fetchWithTimeout } from "@/lib/data-health-fetch";
import { useCallback, useState } from "react";

const CLIENT_TIMEOUT_MS = 15_000;

type ParityRow = {
  source: string;
  jobsCount: number | null;
  candidatesCount: number | null;
  metrics: BreezyAtsMetrics | null;
  error: string | null;
};

function metricsFromPair(
  jobs: BreezyJobsResult | null,
  candidates: BreezyCandidatesResult | null,
): BreezyAtsMetrics | null {
  if (!jobs?.ok || !candidates?.ok) return null;
  return buildBreezyAtsMetrics(candidates, jobs);
}

export function AtsParityDiagnosticsPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParityRow[]>([]);
  const [canonical, setCanonical] = useState<BreezyAtsMetrics | null>(null);

  const runCheck = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const jobsPath = `/api/breezy/jobs${force ? "?force=true" : ""}`;
      const fastPath = `/api/breezy/candidates?scan=fast${force ? "&force=true" : ""}`;
      const reportingPath = `/api/recruiting/ats-reporting${force ? "?force=true" : ""}`;

      const [jobsRes, fastRes, reportingRes] = await Promise.all([
        fetchWithTimeout(jobsPath, { timeoutMs: CLIENT_TIMEOUT_MS, label: "parity-jobs" }),
        fetchWithTimeout(fastPath, { timeoutMs: CLIENT_TIMEOUT_MS, label: "parity-candidates-fast" }),
        fetchWithTimeout(reportingPath, { timeoutMs: CLIENT_TIMEOUT_MS, label: "parity-ats-reporting" }),
      ]);

      const jobs = (await jobsRes.json()) as BreezyJobsResult;
      const fastCandidates = (await fastRes.json()) as BreezyCandidatesResult;
      const reporting = (await reportingRes.json()) as { ok: boolean; ats?: BreezyAtsMetrics; error?: string };

      const fastCacheKey = cacheKey(["breezy", "candidates", "fast", "", ""]);
      const fastCached = getCachedAllowExpired<BreezyCandidatesResult>(fastCacheKey);
      const fullTabCache = peekTabCandidatesCache();

      const nextRows: ParityRow[] = [
        {
          source: "Jobs API (published)",
          jobsCount: jobs.ok ? jobs.jobs.length : null,
          candidatesCount: null,
          metrics: null,
          error: jobs.ok ? null : jobs.error,
        },
        {
          source: "Candidates API (fast scan)",
          jobsCount: null,
          candidatesCount: fastCandidates.ok ? fastCandidates.candidates.length : null,
          metrics: metricsFromPair(jobs, fastCandidates),
          error: fastCandidates.ok ? null : fastCandidates.error,
        },
        {
          source: "Client fast cache",
          jobsCount: null,
          candidatesCount: fastCached?.ok ? fastCached.candidates.length : null,
          metrics: fastCached?.ok ? metricsFromPair(jobs, fastCached) : null,
          error: fastCached?.ok ? null : "Fast client cache empty",
        },
        {
          source: "Candidates tab cache (richest / full hydration)",
          jobsCount: null,
          candidatesCount: fullTabCache ? fullTabCache.candidates.length : null,
          metrics: fullTabCache ? metricsFromPair(jobs, fullTabCache) : null,
          error: fullTabCache ? null : "Candidates tab cache empty",
        },
        {
          source: "ATS reporting bundle (canonical)",
          jobsCount: reporting.ok && reporting.ats ? reporting.ats.publishedJobs : null,
          candidatesCount: reporting.ok && reporting.ats ? reporting.ats.candidatesLoaded : null,
          metrics: reporting.ok && reporting.ats ? reporting.ats : null,
          error: reporting.ok ? null : (reporting.error ?? "Reporting bundle failed"),
        },
      ];

      setRows(nextRows);
      setCanonical(reporting.ok && reporting.ats ? reporting.ats : null);
    } catch (err) {
      const message =
        err instanceof DataHealthRequestTimeoutError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Parity check failed";
      setError(message);
      setRows([]);
      setCanonical(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const hasPartial = rows.some((row) => row.metrics?.partialSync) || canonical?.partialSync;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">ATS parity diagnostics</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Compare published job counts and candidate payloads across Breezy APIs, client caches, and the
            canonical reporting bundle. Headline KPIs should match the reporting bundle row.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void runCheck(false)}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Run parity check"}
          </button>
          <button
            type="button"
            onClick={() => void runCheck(true)}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Force refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {hasPartial ? (
        <p
          role="status"
          className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
        >
          Partial sync detected — counts may differ until all published positions are scanned and caches align.
          {canonical ? ` ${formatBreezyAtsStatusHeadline(canonical)}` : ""}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Jobs API count</th>
                <th className="px-3 py-2 font-medium">Candidates count</th>
                <th className="px-3 py-2 font-medium">Sync type</th>
                <th className="px-3 py-2 font-medium">Last sync</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row) => (
                <tr key={row.source}>
                  <td className="px-3 py-2 font-medium text-zinc-200">{row.source}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">
                    {row.jobsCount != null ? row.jobsCount.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-300">
                    {row.candidatesCount != null ? row.candidatesCount.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {row.metrics ? breezyAtsSyncTierLabel(row.metrics.syncTier) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {row.metrics?.lastSuccessfulSyncLabel ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {row.error
                      ? row.error
                      : row.metrics?.partialSync
                        ? row.metrics.partialReasons.join("; ") || "Partial"
                        : "OK"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">Run a parity check to compare ATS count sources.</p>
      )}
    </section>
  );
}
