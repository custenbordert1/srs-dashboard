"use client";

import { AI_SCORE_TIER_STYLES } from "@/lib/candidate-ai-scoring";
import { RESUME_PARSING_CAPABILITIES } from "@/lib/candidate-resume-prep";
import { CandidateMatchBadge } from "@/components/recruiting/candidate-match-badge";
import type {
  CommandCenterFilterOptions,
  CommandCenterRankedRow,
} from "@/lib/recruiting-command-center";
import { useMemo, useState } from "react";

const ALL = "__all__";

type RankedSortKey = keyof Pick<
  CommandCenterRankedRow,
  "name" | "aiScore" | "matchPercent" | "source" | "position" | "stage" | "appliedDate" | "location"
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

export function TopCandidatesWidget({
  rows,
  onCandidateClick,
}: {
  rows: CommandCenterRankedRow[];
  onCandidateClick?: (candidateId: string) => void;
}) {
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
              role={onCandidateClick ? "button" : undefined}
              tabIndex={onCandidateClick ? 0 : undefined}
              onClick={onCandidateClick ? () => onCandidateClick(row.candidateId) : undefined}
              onKeyDown={
                onCandidateClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onCandidateClick(row.candidateId);
                      }
                    }
                  : undefined
              }
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 ${
                onCandidateClick
                  ? "cursor-pointer transition-colors hover:border-teal-500/30 hover:bg-zinc-900/80"
                  : ""
              }`}
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
              <div className="flex flex-col items-end gap-1">
                <CandidateMatchBadge
                  matchPercent={row.matchPercent}
                  matchLevel={row.matchLevel}
                  isTopMatch={row.isTopMatch}
                  compact
                />
                <AiScoreBadge score={row.aiScore} tier={row.aiTier} tierLabel={row.aiTierLabel} />
              </div>
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
  onCandidateClick,
  selectedCandidateId,
}: {
  rows: CommandCenterRankedRow[];
  filterOptions: CommandCenterFilterOptions;
  onCandidateClick?: (candidateId: string) => void;
  selectedCandidateId?: string | null;
}) {
  const [stateFilter, setStateFilter] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [stageFilter, setStageFilter] = useState(ALL);
  const [matchFilter, setMatchFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<RankedSortKey>("matchPercent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (stateFilter !== ALL && row.state !== stateFilter) return false;
      if (sourceFilter !== ALL && row.source !== sourceFilter) return false;
      if (stageFilter !== ALL && row.stage !== stageFilter) return false;
      if (matchFilter !== ALL && row.matchLevel !== matchFilter) return false;
      return true;
    });
  }, [rows, matchFilter, sourceFilter, stageFilter, stateFilter]);

  function handleSort(key: RankedSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "aiScore" || key === "matchPercent" || key === "appliedDate" ? "desc" : "asc");
  }

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";
      if (sortKey === "aiScore") {
        left = a.aiScore;
        right = b.aiScore;
      } else if (sortKey === "matchPercent") {
        left = a.matchPercent;
        right = b.matchPercent;
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
          Match % weights merchandising resume keywords, travel radius vs job location, response speed, and resume quality.
          High ≥75% · Medium ≥55% · Top match at ≥82% on high tier.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
          <select
            className={selectClass}
            value={matchFilter}
            onChange={(event) => setMatchFilter(event.target.value)}
            aria-label="Filter by match level"
          >
            <option value={ALL}>All match levels</option>
            {filterOptions.matchLevels.map((level) => (
              <option key={level} value={level}>
                {level === "high"
                  ? "High match"
                  : level === "medium"
                    ? "Medium match"
                    : level === "low"
                      ? "Low match"
                      : "No resume"}
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
                <SortableHeader label="Match %" sortKey="matchPercent" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="AI score" sortKey="aiScore" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Source" sortKey="source" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Position" sortKey="position" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Stage" sortKey="stage" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Applied date" sortKey="appliedDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Location" sortKey="location" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {sortedRows.map((row) => {
                const selected = selectedCandidateId === row.candidateId;
                return (
                <tr
                  key={row.candidateId}
                  role={onCandidateClick ? "button" : undefined}
                  tabIndex={onCandidateClick ? 0 : undefined}
                  onClick={onCandidateClick ? () => onCandidateClick(row.candidateId) : undefined}
                  onKeyDown={
                    onCandidateClick
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onCandidateClick(row.candidateId);
                          }
                        }
                      : undefined
                  }
                  className={`hover:bg-zinc-800/30 ${
                    onCandidateClick ? "cursor-pointer" : ""
                  } ${selected ? "bg-teal-500/10" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {row.name}
                      {row.isTopMatch ? (
                        <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-200 ring-1 ring-violet-500/40">
                          Top
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <CandidateMatchBadge
                      matchPercent={row.matchPercent}
                      matchLevel={row.matchLevel}
                      isTopMatch={false}
                      compact
                    />
                  </td>
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
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
