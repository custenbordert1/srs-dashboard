"use client";

import { DashboardFetchAlert } from "@/components/ui/dashboard-fetch-alert";
import { breezyJobsToOverviewRows, countApplicantsByPosition } from "@/lib/recruiting-breezy-adapters";
import { fetchRecruitingLiveSnapshot } from "@/lib/cached-recruiting-live-client";
import { breezyDisconnectedDetail, breezyDisconnectedTitle, classifyBreezyError } from "@/lib/breezy-error-ui";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useState } from "react";

export function BreezyOverviewJobsTable() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof breezyJobsToOverviewRows>>([]);
  const loadingCeilingHit = useLoadingCeiling(loading);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await fetchRecruitingLiveSnapshot(false);
      if (!snap.ok || !snap.jobs?.ok || !snap.candidates?.ok) {
        setError(snap.ok ? "Breezy snapshot incomplete" : snap.error);
        setRows([]);
        return;
      }
      const counts = countApplicantsByPosition(snap.candidates.candidates);
      setRows(breezyJobsToOverviewRows(snap.jobs.jobs, counts));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Breezy jobs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <section
      aria-labelledby="breezy-open-jobs-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <header className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <h2
          id="breezy-open-jobs-heading"
          className="text-lg font-semibold tracking-tight text-zinc-50"
        >
          Active jobs (Breezy)
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Live published positions — not Google Sheet sample data</p>
      </header>

      {error ? (
        <div className="px-4 py-6 sm:px-5">
          <DashboardFetchAlert
            variant={classifyBreezyError(error) === "missing_config" ? "warning" : "error"}
            title={breezyDisconnectedTitle(classifyBreezyError(error))}
            message={breezyDisconnectedDetail(error, classifyBreezyError(error))}
            partial={error.includes("incomplete")}
            onRetry={() => void load()}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">
          {loadingCeilingHit
            ? "Sync in progress — Breezy jobs are taking longer than expected. Use Retry below."
            : "Loading Breezy jobs…"}
        </p>
      ) : !error && rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No published Breezy jobs in the latest sync.</p>
      ) : !error ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Title</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Applicants</th>
                <th className="px-4 py-3 font-medium">Posted</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((job) => (
                <tr key={job.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{job.title}</td>
                  <td className="px-4 py-3 text-zinc-400">{job.location}</td>
                  <td className="px-4 py-3 text-zinc-400">{job.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                    {job.applicants}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{job.posted}</td>
                  <td className="px-4 py-3 text-zinc-500">{job.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No published Breezy jobs in the current sync.</p>
      ) : null}
    </section>
  );
}
