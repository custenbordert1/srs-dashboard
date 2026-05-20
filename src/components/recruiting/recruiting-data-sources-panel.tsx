"use client";

import { RECRUITING_SOURCE_MAP } from "@/lib/recruiting-data-architecture";
import { fetchRecruitingLiveSnapshot } from "@/lib/cached-recruiting-live-client";
import { useCallback, useEffect, useState } from "react";

function formatAge(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}

export function RecruitingDataSourcesPanel() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof fetchRecruitingLiveSnapshot>> | null>(
    null,
  );

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchRecruitingLiveSnapshot(force);
      setSnapshot(data);
      if (!data.ok && !data.partial) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load source diagnostics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const liveSources = RECRUITING_SOURCE_MAP.filter((s) => s.role === "live");
  const archiveSources = RECRUITING_SOURCE_MAP.filter((s) => s.role === "archive" || s.role === "deprecated");

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Recruiting data sources</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Breezy HR is the live engine for jobs and candidates. Google Sheet recruiting rows are
            archive/reference only unless legacy mode is enabled.
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void load(true)}
          className="rounded-lg border border-teal-600/40 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-600/20 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh live snapshot"}
        </button>
      </div>

      {loading && !snapshot ? (
        <p className="mt-4 text-sm text-zinc-500">Loading diagnostics…</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      {snapshot && (snapshot.ok || ("partial" in snapshot && snapshot.partial)) ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DiagCard
            label="Active source"
            value={snapshot.ok ? snapshot.primarySource : snapshot.primarySource ?? "Breezy (partial)"}
          />
          <DiagCard
            label="Sync status"
            value={snapshot.ok ? snapshot.syncStatus : "partial"}
            warn={snapshot.ok ? snapshot.syncStatus !== "ready" : true}
          />
          <DiagCard
            label="Jobs cache age"
            value={formatAge(snapshot.ok ? snapshot.diagnostics.jobsCacheAgeMs : null)}
          />
          <DiagCard
            label="Candidates cache age"
            value={formatAge(snapshot.ok ? snapshot.diagnostics.candidatesCacheAgeMs : null)}
          />
          <DiagCard
            label="Published jobs"
            value={
              snapshot.ok && snapshot.jobs.ok
                ? snapshot.jobs.jobs.length.toLocaleString()
                : "—"
            }
          />
          <DiagCard
            label="Candidates pulled"
            value={
              snapshot.ok && snapshot.candidates.ok
                ? snapshot.candidates.candidates.length.toLocaleString()
                : "—"
            }
          />
          <DiagCard
            label="Sheet live mode"
            value={snapshot.ok && snapshot.sheetLiveEnabled ? "ON (legacy)" : "OFF"}
            warn={Boolean(snapshot.ok && snapshot.sheetLiveEnabled)}
          />
          <DiagCard
            label="Last Breezy refresh"
            value={
              snapshot.ok && snapshot.jobs.fetchedAt
                ? new Date(snapshot.jobs.fetchedAt).toLocaleString()
                : "—"
            }
          />
        </div>
      ) : null}

      {snapshot?.ok && snapshot.diagnostics.staleWarning ? (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {snapshot.diagnostics.staleWarning}
        </p>
      ) : null}

      {snapshot?.ok && snapshot.jobLocationDiagnostics ? (
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Job location normalization</p>
          <p className="mt-1 text-sm text-zinc-400">
            Missing city/state:{" "}
            <span className="font-medium text-zinc-200">
              {snapshot.jobLocationDiagnostics.missingLocationCount} /{" "}
              {snapshot.jobLocationDiagnostics.totalJobs}
            </span>
          </p>
          {Object.keys(snapshot.jobLocationDiagnostics.bySource).length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-zinc-500">
              {Object.entries(snapshot.jobLocationDiagnostics.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => (
                  <li key={source}>
                    <span className="font-mono text-zinc-400">{source}</span>: {count}
                  </li>
                ))}
            </ul>
          ) : null}
          {snapshot.jobLocationDiagnostics.samples.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="pr-3 py-1">Source</th>
                    <th className="pr-3 py-1">City</th>
                    <th className="pr-3 py-1">State</th>
                    <th className="py-1">Display</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  {snapshot.jobLocationDiagnostics.samples.map((row) => (
                    <tr key={row.jobId} className="border-t border-zinc-800/60">
                      <td className="pr-3 py-1.5 font-mono text-zinc-500">{row.locationSource}</td>
                      <td className="pr-3 py-1.5">{row.city || "—"}</td>
                      <td className="pr-3 py-1.5">{row.state || "—"}</td>
                      <td className="py-1.5">{row.displayLocation || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SourceList title="Live sources" sources={liveSources} />
        <SourceList title="Archive / deprecated" sources={archiveSources} />
      </div>
    </section>
  );
}

function DiagCard({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        warn ? "border-amber-500/30 bg-amber-500/10" : "border-zinc-800/80 bg-zinc-950/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function SourceList({
  title,
  sources,
}: {
  title: string;
  sources: typeof RECRUITING_SOURCE_MAP;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      <ul className="mt-2 space-y-2 text-xs text-zinc-500">
        {sources.map((s) => (
          <li key={s.id}>
            <span className="font-medium text-zinc-300">{s.label}</span>
            {s.apiPath ? (
              <span className="ml-1 font-mono text-zinc-600">{s.apiPath}</span>
            ) : null}
            <p className="mt-0.5 text-zinc-600">{s.notes}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
