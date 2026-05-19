"use client";

import { AppShell } from "@/components/auth/app-shell";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import type { UserPublic } from "@/lib/auth/types";
import type { DmAttentionItem, DmDashboardSnapshot } from "@/lib/dm-dashboard";
import { useCallback, useEffect, useState } from "react";

type DmDashboardProps = {
  user: UserPublic;
};

type DashboardResponse = {
  ok: boolean;
  error?: string;
  dashboard?: DmDashboardSnapshot;
  meta?: {
    partialSync?: boolean;
    filteredJobs?: number;
    filteredCandidates?: number;
  };
};

function severityStyles(severity: DmAttentionItem["severity"]): string {
  return severity === "critical"
    ? "border-red-500/30 bg-red-500/10 text-red-100"
    : "border-amber-500/30 bg-amber-500/10 text-amber-100";
}

function AttentionList({
  title,
  subtitle,
  items,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  items: DmAttentionItem[];
  emptyLabel: string;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-lg border px-3 py-2.5 text-sm ${severityStyles(item.severity)}`}
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs opacity-90">{item.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DmDashboard({ user }: DmDashboardProps) {
  const [data, setData] = useState<DmDashboardSnapshot | null>(null);
  const [meta, setMeta] = useState<DashboardResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dm/dashboard", { cache: "no-store" });
      const parsed = (await res.json()) as DashboardResponse;
      if (!res.ok || !parsed.ok || !parsed.dashboard) {
        setError(parsed.error ?? "Failed to load dashboard");
        setData(null);
        return;
      }
      setData(parsed.dashboard);
      setMeta(parsed.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dm/dashboard", { cache: "no-store" });
        const parsed = (await res.json()) as DashboardResponse;
        if (cancelled) return;
        if (!res.ok || !parsed.ok || !parsed.dashboard) {
          setError(parsed.error ?? "Failed to load dashboard");
          setData(null);
          return;
        }
        setData(parsed.dashboard);
        setMeta(parsed.meta);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle =
    user.role === "dm"
      ? `Territory: ${user.territoryStates.join(", ") || "—"}`
      : "Executive view — all territories (Breezy data filtered when scoped)";

  return (
    <AppShell
      user={user}
      title={user.role === "dm" ? `${user.name} · Territory dashboard` : "DM territory dashboard"}
      subtitle={subtitle}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Live Breezy data · AI-ranked candidates · needs-attention automation
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {meta?.partialSync ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Partial Breezy sync — some positions may not be included in candidate counts yet.
        </p>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading territory metrics…</p>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {data.kpis.map((kpi) => (
              <article
                key={kpi.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3 shadow-sm shadow-black/10"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{kpi.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{kpi.value}</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{kpi.hint}</p>
              </article>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <IntelligenceBarChart
              title="Top hiring cities"
              subtitle="Published jobs in territory"
              data={data.topHiringCities}
              barClassName="bg-teal-500/80"
            />
            <IntelligenceBarChart
              title="Candidate sources"
              subtitle="Applicants in territory"
              data={data.candidateSources}
              barClassName="bg-violet-500/80"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AttentionList
              title="Fill-risk alerts"
              subtitle="Critical signals from aging roles and weak pipelines"
              items={data.fillRiskAlerts}
              emptyLabel="No fill-risk alerts in your territory."
            />
            <AttentionList
              title="Needs attention"
              subtitle="No applicants (7d), aging jobs, low flow, low interview conversion"
              items={data.needsAttention}
              emptyLabel="No items need attention right now."
            />
          </div>

          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Top AI-scored candidates</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Heuristic ranking from profile metadata — ready for resume parsing and MEL integration.
            </p>
            {data.topCandidates.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No candidates in territory.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                      <th className="pb-2 pr-3 font-medium">Candidate</th>
                      <th className="pb-2 pr-3 font-medium">Score</th>
                      <th className="pb-2 pr-3 font-medium">Position</th>
                      <th className="pb-2 pr-3 font-medium">Location</th>
                      <th className="pb-2 pr-3 font-medium">Stage</th>
                      <th className="pb-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCandidates.map((row) => (
                      <tr key={row.candidateId} className="border-b border-zinc-800/60 last:border-0">
                        <td className="py-2.5 pr-3 font-medium text-zinc-100">{row.name}</td>
                        <td className="py-2.5 pr-3 tabular-nums text-zinc-300">
                          {row.score}{" "}
                          <span className="text-xs text-zinc-500">({row.tierLabel})</span>
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-400">{row.position}</td>
                        <td className="py-2.5 pr-3 text-zinc-400">
                          {row.city}, {row.state}
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-400">{row.stage}</td>
                        <td className="py-2.5 text-zinc-400">{row.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-zinc-600">
            Snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.activeJobs} jobs ·{" "}
            {data.candidates.length} candidates in scope
            {meta?.filteredJobs != null ? ` (${meta.filteredJobs} jobs after filter)` : ""}
          </p>
        </>
      ) : null}
    </AppShell>
  );
}
