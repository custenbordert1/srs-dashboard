"use client";

import type { BreezyCandidatesResult } from "@/lib/breezy-api";
import {
  buildCandidateIntelligence,
  type CandidateDetectionRow,
  type CandidateIntelligenceSnapshot,
} from "@/lib/candidate-intelligence";
import { useEffect, useMemo, useState } from "react";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { KpiCards } from "./kpi-cards";

function CandidateIntelligenceSkeleton() {
  return (
    <section className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div className="h-7 w-56 animate-pulse rounded bg-zinc-800/80" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40"
          />
        ))}
      </div>
    </section>
  );
}

function formatDays(days: number | null): string {
  if (days === null) return "—";
  return `${days}d`;
}

function DetectionTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: CandidateDetectionRow[];
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h3>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No candidates detected.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Candidate</th>
                <th className="px-4 py-3 font-medium sm:px-5">Market</th>
                <th className="px-4 py-3 font-medium sm:px-5">DM</th>
                <th className="px-4 py-3 font-medium sm:px-5">Recruiter</th>
                <th className="px-4 py-3 font-medium sm:px-5">Status</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Age</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Last update</th>
                <th className="px-4 py-3 font-medium sm:px-5">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.market}</td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.dm}</td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.recruiter}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                    {formatDays(row.ageDays)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                    {formatDays(row.daysSinceUpdate)}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RecruiterLoadList({ snapshot }: { snapshot: CandidateIntelligenceSnapshot }) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <h3 className="text-lg font-semibold tracking-tight text-zinc-50">Recruiter load</h3>
      <p className="mt-1 text-sm text-zinc-500">Recruiters with 25+ active candidates are flagged.</p>
      {snapshot.overloadedRecruiters.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No overloaded recruiters detected.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {snapshot.overloadedRecruiters.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm"
            >
              <span className="font-medium text-zinc-200">{row.label}</span>
              <span className="tabular-nums text-amber-200">{row.value} candidates</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CandidateIntelligenceSection() {
  const [data, setData] = useState<BreezyCandidatesResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/breezy/candidates", { cache: "no-store" });
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

  const snapshot = useMemo(() => {
    if (!data?.ok) return null;
    return buildCandidateIntelligence(data.candidates);
  }, [data]);

  if (data === undefined) return <CandidateIntelligenceSkeleton />;

  if (!data.ok) {
    return (
      <section className="space-y-4 border-t border-zinc-800/80 pt-8">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Candidate intelligence</h2>
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {data.error}
        </div>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <section className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Candidate intelligence</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Live Breezy candidate performance, funnel health, recruiter load, and candidate risk
          signals.
        </p>
        {data.truncated ? (
          <p className="mt-2 text-xs text-amber-300">
            Candidate pull scanned {data.positionsScanned?.toLocaleString()} positions and may be truncated.
          </p>
        ) : null}
      </div>

      <KpiCards
        items={snapshot.kpis}
        gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      />

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <IntelligenceBarChart
          title="Candidate pipeline funnel"
          subtitle="Candidates by current Breezy stage"
          data={snapshot.pipelineFunnel}
          valueLabel="candidates"
          barClassName="bg-teal-500/80"
        />
        <IntelligenceBarChart
          title="Applicants by state"
          subtitle="Candidate markets from Breezy profile/location data"
          data={snapshot.applicantsByState}
          valueLabel="candidates"
          barClassName="bg-sky-500/80"
        />
        <IntelligenceBarChart
          title="Applicants by recruiter"
          subtitle="Candidate load by owner/recruiter"
          data={snapshot.applicantsByRecruiter}
          valueLabel="candidates"
          barClassName="bg-violet-500/80"
        />
        <IntelligenceBarChart
          title="Hiring velocity trend"
          subtitle="Hired candidates by created week"
          data={snapshot.hiringVelocityTrend}
          valueLabel="hires"
          barClassName="bg-emerald-500/80"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <IntelligenceBarChart
          title="Applicants by city/state"
          data={snapshot.applicantsByMarket}
          valueLabel="candidates"
          barClassName="bg-amber-500/80"
        />
        <IntelligenceBarChart
          title="Applicants by position"
          data={snapshot.applicantsByPosition}
          valueLabel="candidates"
          barClassName="bg-cyan-500/80"
        />
        <IntelligenceBarChart
          title="High-performing markets"
          subtitle="Sum of hire probability score by market"
          data={snapshot.highPerformingMarkets}
          valueLabel="score"
          barClassName="bg-emerald-500/80"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <DetectionTable
          title="Stalled candidates"
          description="Active candidates with no update in 14+ days"
          rows={snapshot.stalledCandidates}
        />
        <DetectionTable
          title="Aging applicants"
          description="Candidates in pipeline for 21+ days"
          rows={snapshot.agingApplicants}
        />
        <DetectionTable
          title="Ghosted candidates"
          description="Early-stage candidates with no update in 10+ days"
          rows={snapshot.ghostedCandidates}
        />
      </div>

      <RecruiterLoadList snapshot={snapshot} />
    </section>
  );
}
