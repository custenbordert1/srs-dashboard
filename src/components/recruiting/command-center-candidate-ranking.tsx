"use client";

import { AI_SCORE_TIER_STYLES } from "@/lib/candidate-ai-scoring";
import { RESUME_PARSING_CAPABILITIES } from "@/lib/candidate-resume-prep";
import type {
  CommandCenterFilterOptions,
  CommandCenterRankedRow,
} from "@/lib/recruiting-command-center";
import { useMemo, useState } from "react";

const ALL = "__all__";

type RankedSortKey = keyof Pick<
  CommandCenterRankedRow,
  "name" | "aiScore" | "source" | "position" | "stage" | "appliedDate" | "location"
>;

function AiScoreBadge({ score, tier, tierLabel }: { score: number; tier: CommandCenterRankedRow["aiTier"]; tierLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex min-w-[2.25rem] justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${AI_SCORE_TIER_STYLES[tier]}`}
      >
        {score}
      </span>
      <span className="text-[10px] text-zinc-500">{tierLabel}</span>
    </span>
  );
}

export function TopCandidatesWidget({ rows }: { rows: CommandCenterRankedRow[] }) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Top candidates</h2>
          <p className="mt-1 text-sm text-zinc-500">Highest AI-ranked applicants from the current Breezy sync.</p>
        </div>
        <p className="text-[10px] text-zinc-600">{RESUME_PARSING_CAPABILITIES.notes}</p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No scored candidates available.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.candidateId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">
                  <span className="mr-2 text-zinc-600">#{index + 1}</span>
                  {row.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {row.position} · {row.location}
                </p>
              </div>
              <AiScoreBadge score={row.aiScore} tier={row.aiTier} tierLabel={row.aiTierLabel} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: RankedSortKey;
  activeKey: RankedSortKey;
  direction: "asc" | "desc";
  onSort: (key: RankedSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th className="px-4 py-3 font-medium sm:px-5">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-left uppercase tracking-wider hover:text-zinc-300"
      >
        {label}
        <span className="text-[10px] text-zinc-600">{active ? (direction === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

const selectClass =
  "rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-teal-500/50";

export function RankedCandidatesTable({
  rows,
  filterOptions,
}: {
  rows: CommandCenterRankedRow[];
  filterOptions: CommandCenterFilterOptions;
}) {
  const [stateFilter, setStateFilter] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [stageFilter, setStageFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<RankedSortKey>("aiScore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (stateFilter !== ALL && row.state !== stateFilter) return false;
      if (sourceFilter !== ALL && row.source !== sourceFilter) return false;
      if (stageFilter !== ALL && row.stage !== stageFilter) return false;
      return true;
    });
  }, [rows, sourceFilter, stageFilter, stateFilter]);

  function handleSort(key: RankedSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "aiScore" || key === "appliedDate" ? "desc" : "asc");
  }

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";
      if (sortKey === "aiScore") {
        left = a.aiScore;
        right = b.aiScore;
      } else if (sortKey === "appliedDate") {
        left = new Date(a.appliedDate).getTime() || 0;
        right = new Date(b.appliedDate).getTime() || 0;
      } else {
        left = a[sortKey].toLowerCase();
        right = b[sortKey].toLowerCase();
      }
      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filteredRows, sortDirection, sortKey]);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">AI-ranked candidates</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Scores 1–100 from merchandising fit, reset/Walmart-Target experience, travel, tenure, source quality, and stage.
          Elite 90+ · Strong 75+ · Moderate 60+ · Weak below 60.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select className={selectClass} value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} aria-label="Filter by state">
            <option value={ALL}>All states</option>
            {filterOptions.states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <select className={selectClass} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Filter by source">
            <option value={ALL}>All sources</option>
            {filterOptions.sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select className={selectClass} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} aria-label="Filter by stage">
            <option value={ALL}>All stages</option>
            {filterOptions.stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Showing {sortedRows.length.toLocaleString()} of {rows.length.toLocaleString()} candidates
        </p>
      </div>
      {sortedRows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No candidates match the selected filters.</p>
      ) : (
        <div className="max-h-[min(70vh,720px)] overflow-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm">
              <tr className="border-b border-zinc-800/80 text-xs text-zinc-500">
                <SortableHeader label="Name" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="AI score" sortKey="aiScore" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Source" sortKey="source" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Position" sortKey="position" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Stage" sortKey="stage" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Applied date" sortKey="appliedDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Location" sortKey="location" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {sortedRows.map((row) => (
                <tr key={row.candidateId} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.name}</td>
                  <td className="px-4 py-3 sm:px-5">
                    <AiScoreBadge score={row.aiScore} tier={row.aiTier} tierLabel={row.aiTierLabel} />
                  </td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.source}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.position}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.stage}</td>
                  <td className={`px-4 py-3 sm:px-5 ${row.agingClassName}`}>
                    {row.appliedDateLabel}
                    {row.appliedHoursAgo !== null ? (
                      <span className="ml-1 text-[10px] text-zinc-600">({row.appliedHoursAgo}h)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
