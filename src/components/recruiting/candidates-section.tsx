"use client";

import type { BreezyCandidate, BreezyCandidatesResult } from "@/lib/breezy-api";
import { useEffect, useMemo, useState } from "react";

const ALL = "__all__";
const selectClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";
const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(raw: string): string {
  const date = parseDate(raw);
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function candidateName(candidate: BreezyCandidate): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email || "Unknown candidate";
}

function sourceBreakdown(candidates: BreezyCandidate[]): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const source = candidate.source || "Unknown source";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));
}

function CandidatesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-20 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function CandidatesSection() {
  const [data, setData] = useState<BreezyCandidatesResult | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [stageFilter, setStageFilter] = useState(ALL);
  const [positionFilter, setPositionFilter] = useState(ALL);
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/breezy/candidates", { cache: "no-store" });
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error(`Breezy candidates returned HTTP ${res.status} instead of dashboard data.`);
        }
        const parsed = (await res.json()) as BreezyCandidatesResult;
        if (!cancelled) setData(parsed);
      } catch (err) {
        if (!cancelled) {
          setData({
            ok: false,
            error: err instanceof Error ? err.message : "Failed to load Breezy candidates",
            fetchedAt: new Date().toISOString(),
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const candidates = data?.ok ? data.candidates : [];
  const sourceOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.source)), [candidates]);
  const stageOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.stage)), [candidates]);
  const positionOptions = useMemo(() => sortedUnique(candidates.map((candidate) => candidate.positionName)), [candidates]);

  const filtered = useMemo(() => {
    const fromDate = appliedFrom ? new Date(`${appliedFrom}T00:00:00`) : null;
    const toDate = appliedTo ? new Date(`${appliedTo}T23:59:59`) : null;

    return candidates.filter((candidate) => {
      if (sourceFilter !== ALL && candidate.source !== sourceFilter) return false;
      if (stageFilter !== ALL && candidate.stage !== stageFilter) return false;
      if (positionFilter !== ALL && candidate.positionName !== positionFilter) return false;

      const appliedDate = parseDate(candidate.appliedDate);
      if (fromDate && (!appliedDate || appliedDate < fromDate)) return false;
      if (toDate && (!appliedDate || appliedDate > toDate)) return false;

      return true;
    });
  }, [appliedFrom, appliedTo, candidates, positionFilter, sourceFilter, stageFilter]);

  const newestApplicantDate = useMemo(() => {
    const newest = filtered
      .map((candidate) => parseDate(candidate.appliedDate))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return newest ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(newest) : "—";
  }, [filtered]);

  const breakdown = useMemo(() => sourceBreakdown(filtered), [filtered]);

  if (data === undefined) return <CandidatesSkeleton />;

  if (!data.ok) {
    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 sm:p-5">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Candidates</h1>
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {data.error}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Candidates</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              Clean live Breezy candidates for local dashboard review. Raw Breezy payloads, resume bodies, and HTML are not rendered.
            </p>
          </div>
          <p className="text-xs text-zinc-500">Fetched {formatDate(data.fetchedAt)}</p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Candidates shown" value={filtered.length.toLocaleString()} hint={`${candidates.length.toLocaleString()} loaded`} />
        <SummaryCard label="Newest applicant" value={newestApplicantDate} />
        <SummaryCard
          label="Top sources"
          value={breakdown.length > 0 ? breakdown.map((row) => `${row.source}: ${row.count}`).join(" · ") : "—"}
        />
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="grid gap-3 border-b border-zinc-800/80 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5 sm:px-5">
          <select className={selectClass} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value={ALL}>All sources</option>
            {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          <select className={selectClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value={ALL}>All stages</option>
            {stageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          <select className={selectClass} value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
            <option value={ALL}>All positions</option>
            {positionOptions.map((position) => <option key={position} value={position}>{position}</option>)}
          </select>
          <input className={inputClass} type="date" value={appliedFrom} onChange={(event) => setAppliedFrom(event.target.value)} aria-label="Applied from date" />
          <input className={inputClass} type="date" value={appliedTo} onChange={(event) => setAppliedTo(event.target.value)} aria-label="Applied to date" />
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-sm text-zinc-500 sm:px-5">No candidates match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium sm:px-5">Name</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Email</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Phone</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Source</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Stage</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Applied Date</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map((candidate) => (
                  <tr key={candidate.candidateId} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{candidateName(candidate)}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.email || "—"}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.phone || "—"}</td>
                    <td className="px-4 py-3 text-zinc-400 sm:px-5">{candidate.source || "Unknown source"}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.stage || "Unknown stage"}</td>
                    <td className="px-4 py-3 text-zinc-400 sm:px-5">{formatDate(candidate.appliedDate)}</td>
                    <td className="px-4 py-3 text-zinc-300 sm:px-5">{candidate.positionName || "Unknown position"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
