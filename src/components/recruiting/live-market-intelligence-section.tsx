"use client";

import type { BreezyCandidatesResult } from "@/lib/breezy-api";
import type { SheetDataResult } from "@/lib/google-sheet-csv";
import {
  buildLiveMarketIntelligence,
  type LiveMarketIntelligenceRow,
  type MarketStatusLabel,
} from "@/lib/intelligence-engine";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { useEffect, useMemo, useState } from "react";

type LiveMarketIntelligenceSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

const ALL = "__all__";
const selectClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

const STATUS_STYLES: Record<MarketStatusLabel, string> = {
  Healthy: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
  Warning: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30",
  Critical: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  "Dead Zone": "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
  Oversaturated: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30",
};

function sortedUnique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function scoreClass(score: number) {
  if (score >= 75) return "text-emerald-300";
  if (score >= 50) return "text-yellow-300";
  return "text-red-300";
}

function MarketDrawer({
  market,
  onClose,
}: {
  market: LiveMarketIntelligenceRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-zinc-50">{market.market}</h3>
            <p className="mt-1 font-mono text-xs text-teal-300">{market.key}</p>
            <p className="mt-2 text-sm text-zinc-500">
              {market.status} · Health {market.marketHealthScore} · Risk {market.recruitingRiskScore}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Openings", market.totalOpenings],
              ["Zero-app reqs", market.zeroApplicantOpenings],
              ["Open calls", market.melProjects.filter((p) => !p.status.toLowerCase().includes("complete")).length],
              ["Pipeline", market.candidatePipelineTotal],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h4 className="font-semibold text-zinc-100">Ownership</h4>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">DM ownership</dt>
                <dd className="mt-1 font-medium text-zinc-200">{market.dmOwner}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Recruiter ownership</dt>
                <dd className="mt-1 font-medium text-zinc-200">{market.recruiterOwner}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h4 className="font-semibold text-zinc-100">Recommendations</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {market.recommendations.length > 0 ? (
                market.recommendations.map((recommendation) => (
                  <span
                    key={recommendation}
                    className="rounded-md border border-teal-500/25 bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-200"
                  >
                    {recommendation}
                  </span>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No immediate recommendation.</p>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h4 className="font-semibold text-zinc-100">Candidate pipeline</h4>
              <ul className="mt-3 space-y-2 text-sm">
                {market.candidatePipelineBreakdown.length > 0 ? (
                  market.candidatePipelineBreakdown.map((row) => (
                    <li key={row.status} className="flex justify-between gap-3">
                      <span className="text-zinc-400">{row.status}</span>
                      <span className="font-medium tabular-nums text-zinc-200">{row.count}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">No candidate pipeline records.</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h4 className="font-semibold text-zinc-100">Activity history</h4>
              <ol className="mt-3 space-y-3 text-sm">
                {market.activityHistory.map((event) => (
                  <li key={`${event.label}-${event.detail}`} className="border-l border-zinc-700 pl-3">
                    <p className="font-medium text-zinc-200">{event.label}</p>
                    <p className="text-zinc-500">{event.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h4 className="font-semibold text-zinc-100">MEL projects</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-left text-sm">
                <tbody className="divide-y divide-zinc-800">
                  {market.melProjects.slice(0, 12).map((project, index) => (
                    <tr key={`${project.projectNo}-${index}`}>
                      <td className="px-4 py-3 text-zinc-200">{project.projectName}</td>
                      <td className="px-4 py-3 text-zinc-400">{project.storeCall}</td>
                      <td className="px-4 py-3 text-zinc-400">{project.status}</td>
                      <td className="px-4 py-3 text-zinc-500">{project.rep}</td>
                    </tr>
                  ))}
                  {market.melProjects.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-zinc-500">No MEL projects mapped.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function LiveMarketIntelligenceSection({ recruiting, mel }: LiveMarketIntelligenceSectionProps) {
  const [candidateData, setCandidateData] = useState<BreezyCandidatesResult | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState(ALL);
  const [dmFilter, setDmFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sort, setSort] = useState<"urgency" | "health" | "risk" | "openings">("urgency");
  const [selected, setSelected] = useState<LiveMarketIntelligenceRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/breezy/candidates", { cache: "no-store" });
        const parsed = (await res.json()) as BreezyCandidatesResult;
        if (!cancelled) setCandidateData(parsed);
      } catch (err) {
        if (!cancelled) {
          setCandidateData({
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
    if (!recruiting.ok || !mel.ok) return null;
    return buildLiveMarketIntelligence({
      recruitingRows: recruiting.rows,
      recruitingHeaders: recruiting.headers,
      melRows: mel.rows,
      melHeaders: mel.headers,
      candidates: candidateData?.ok ? candidateData.candidates : [],
    });
  }, [candidateData, mel, recruiting]);

  const stateOptions = useMemo(() => sortedUnique(snapshot?.markets.map((row) => row.state) ?? []), [snapshot]);
  const dmOptions = useMemo(() => sortedUnique(snapshot?.markets.map((row) => row.dmOwner) ?? []), [snapshot]);

  const rows = useMemo(() => {
    const searched = search.trim().toLowerCase();
    return (snapshot?.markets ?? [])
      .filter((row) => !searched || row.market.toLowerCase().includes(searched) || row.key.toLowerCase().includes(searched))
      .filter((row) => stateFilter === ALL || row.state === stateFilter)
      .filter((row) => dmFilter === ALL || row.dmOwner === dmFilter)
      .filter((row) => statusFilter === ALL || row.status === statusFilter)
      .sort((a, b) => {
        if (sort === "health") return a.marketHealthScore - b.marketHealthScore;
        if (sort === "risk") return b.recruitingRiskScore - a.recruitingRiskScore;
        if (sort === "openings") return b.totalOpenings - a.totalOpenings;
        return b.staffingUrgencyScore - a.staffingUrgencyScore || a.marketHealthScore - b.marketHealthScore;
      });
  }, [dmFilter, search, snapshot, sort, stateFilter, statusFilter]);

  if (!recruiting.ok || !mel.ok) return null;
  if (!snapshot) return null;

  return (
    <section className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Live Market Intelligence</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Unified market intelligence keyed by canonical CITY_STATE across recruiting, MEL,
          candidate pipeline, automation, and data quality.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="grid gap-3 border-b border-zinc-800/80 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5 sm:px-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search market or key"
            className={selectClass}
          />
          <select className={selectClass} value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value={ALL}>All states</option>
            {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
          <select className={selectClass} value={dmFilter} onChange={(event) => setDmFilter(event.target.value)}>
            <option value={ALL}>All DMs</option>
            {dmOptions.map((dm) => <option key={dm} value={dm}>{dm}</option>)}
          </select>
          <select className={selectClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value={ALL}>All statuses</option>
            {(["Healthy", "Warning", "Critical", "Dead Zone", "Oversaturated"] satisfies MarketStatusLabel[]).map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select className={selectClass} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="urgency">Sort by urgency</option>
            <option value="health">Sort by weakest health</option>
            <option value="risk">Sort by recruiting risk</option>
            <option value="openings">Sort by openings</option>
          </select>
        </div>

        <div className="max-h-[42rem] overflow-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Market</th>
                <th className="px-4 py-3 font-medium sm:px-5">Status</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Health</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Risk</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Urgency</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Openings</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Zero apps</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Velocity</th>
                <th className="px-4 py-3 font-medium sm:px-5">DM</th>
                <th className="px-4 py-3 font-medium sm:px-5">Recruiter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row) => (
                <tr
                  key={row.key}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer hover:bg-zinc-800/30"
                >
                  <td className="px-4 py-3 sm:px-5">
                    <p className="font-medium text-zinc-100">{row.market}</p>
                    <p className="font-mono text-xs text-zinc-500">{row.key}</p>
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums sm:px-5 ${scoreClass(row.marketHealthScore)}`}>
                    {row.marketHealthScore}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">{row.recruitingRiskScore}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">{row.staffingUrgencyScore}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">{row.totalOpenings}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">{row.zeroApplicantOpenings}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">{row.applicantVelocity}</td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.dmOwner}</td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.recruiterOwner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? <MarketDrawer market={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
