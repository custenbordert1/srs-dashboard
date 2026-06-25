"use client";

import type {
  RecruiterCommandCenter,
  RecruiterCommandCenterWorkItem,
  RecruiterWorkCategoryId,
} from "@/lib/recruiter-command-center/types";
import type { RecruiterPriorityLevel } from "@/lib/recruiter-priority";
import { RECRUITER_WORK_CATEGORY_LABELS } from "@/lib/recruiter-command-center/types";
import {
  filterCommandCenterWorkQueue,
  type CommandCenterQueueFilters,
} from "@/lib/recruiter-command-center/filter-work-queue";
import { CandidateExcelExportControls } from "@/components/recruiting/candidate-excel-export-controls";
import { formatActionDueLabel } from "@/lib/recruiter-priority";
import { useCandidateExcelExport } from "@/lib/recruiter-command-center/use-candidate-excel-export";
import { useCallback, useEffect, useMemo, useState } from "react";

const PRIORITY_STYLES: Record<RecruiterPriorityLevel, string> = {
  high: "border-red-500/35 bg-red-500/10 text-red-100",
  medium: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  low: "border-zinc-700 bg-zinc-900/40 text-zinc-300",
};

type PriorityFilter = "all" | RecruiterPriorityLevel;
type OverdueFilter = "all" | "overdue" | "current";
type CoverageFilter = "all" | "urgent" | "healthy";
function MetricCard({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string | number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${alert ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800/80 bg-zinc-900/40"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-amber-200" : "text-zinc-50"}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function formatAge(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function WorkQueueTable({
  rows,
  referenceMs,
  selectedIds,
  onToggleRow,
  onToggleAll,
  showSelection,
}: {
  rows: RecruiterCommandCenterWorkItem[];
  referenceMs: number;
  selectedIds: Set<string>;
  onToggleRow: (candidateId: string) => void;
  onToggleAll: (candidateIds: string[], selected: boolean) => void;
  showSelection: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-2 py-3 text-sm text-zinc-500">No candidates match the current filters.</p>;
  }

  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.candidateId));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="text-zinc-500">
            {showSelection ? (
              <th className="px-2 py-2 font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) =>
                    onToggleAll(
                      rows.map((row) => row.candidateId),
                      event.target.checked,
                    )
                  }
                  aria-label="Select all visible candidates"
                  className="rounded border-zinc-600 bg-zinc-950"
                />
              </th>
            ) : null}
            <th className="px-2 py-2 font-medium">Candidate</th>
            <th className="px-2 py-2 font-medium">Recruiter</th>
            <th className="px-2 py-2 font-medium">Category</th>
            <th className="px-2 py-2 font-medium">Next action</th>
            <th className="px-2 py-2 font-medium">Due</th>
            <th className="px-2 py-2 font-medium">Priority</th>
            <th className="px-2 py-2 font-medium">Reasons</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-t border-zinc-800/60 text-zinc-200">
              {showSelection ? (
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.candidateId)}
                    onChange={() => onToggleRow(row.candidateId)}
                    aria-label={`Select ${row.candidateName}`}
                    className="rounded border-zinc-600 bg-zinc-950"
                  />
                </td>
              ) : null}
              <td className="px-2 py-2">
                <p className="font-medium text-zinc-100">{row.candidateName}</p>
                <p className="text-[10px] text-zinc-500">
                  {row.grade} · {row.workflowStatus} · {formatAge(row.queueAgeHours)}
                </p>
              </td>
              <td className="px-2 py-2">{row.recruiter}</td>
              <td className="px-2 py-2 text-zinc-400">{row.categoryLabel}</td>
              <td className="px-2 py-2">{row.nextAction}</td>
              <td className="px-2 py-2 tabular-nums">
                {formatActionDueLabel(row.actionDueDate, referenceMs)}
              </td>
              <td className="px-2 py-2">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[row.priorityLevel]}`}
                >
                  {row.priorityLevel} ({row.priorityScore})
                </span>
              </td>
              <td className="max-w-[14rem] px-2 py-2 text-[10px] text-zinc-400">
                {row.priorityReasons.join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecruiterCommandCenterPanel() {
  const [commandCenter, setCommandCenter] = useState<RecruiterCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recruiterFilter, setRecruiterFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<RecruiterWorkCategoryId | "all">("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const [overdueFilter, setOverdueFilter] = useState<OverdueFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async (recruiter?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (recruiter && recruiter !== "all") params.set("recruiter", recruiter);
      const query = params.toString();
      const res = await fetch(`/api/recruiting/command-center${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        commandCenter?: RecruiterCommandCenter;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.commandCenter) {
        setError(data.error ?? "Failed to load recruiter command center");
        return;
      }
      setCommandCenter(data.commandCenter);
    } catch {
      setError("Failed to load recruiter command center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(recruiterFilter);
  }, [load, recruiterFilter]);

  const referenceMs = useMemo(
    () => (commandCenter ? Date.parse(commandCenter.fetchedAt) : Date.now()),
    [commandCenter],
  );

  const queueFilters = useMemo<CommandCenterQueueFilters>(
    () => ({
      searchQuery,
      priorityFilter,
      categoryFilter,
      actionFilter,
      coverageFilter,
      overdueFilter,
    }),
    [searchQuery, priorityFilter, categoryFilter, actionFilter, coverageFilter, overdueFilter],
  );

  const actionOptions = useMemo(() => {
    if (!commandCenter) return [];
    return [...new Set(commandCenter.workQueue.map((item) => item.nextAction))].sort();
  }, [commandCenter]);

  const filteredQueue = useMemo(() => {
    if (!commandCenter) return [];
    return filterCommandCenterWorkQueue(commandCenter.workQueue, queueFilters);
  }, [commandCenter, queueFilters]);

  const toggleRowSelection = useCallback((candidateId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }, []);

  const toggleAllSelection = useCallback((candidateIds: string[], selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const candidateId of candidateIds) {
        if (selected) next.add(candidateId);
        else next.delete(candidateId);
      }
      return next;
    });
  }, []);

  const resolveFilteredExportItems = useCallback(
    (workQueue: RecruiterCommandCenterWorkItem[]) =>
      filterCommandCenterWorkQueue(workQueue, queueFilters),
    [queueFilters],
  );

  const { exportScope, setExportScope, exporting, exportError, handleExport } = useCandidateExcelExport({
    recruiterFilter,
    selectedIds,
    resolveFilteredItems: resolveFilteredExportItems,
    disabled: loading,
  });

  const filteredTopPriorities = useMemo(() => {
    if (!commandCenter) return [];
    return commandCenter.topPriorities.filter((item) =>
      filteredQueue.some((row) => row.candidateId === item.candidateId),
    );
  }, [commandCenter, filteredQueue]);

  if (loading && !commandCenter) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Recruiter Operations Center</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !commandCenter) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Recruiter Operations Center</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
        <button
          type="button"
          onClick={() => void load(recruiterFilter)}
          className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!commandCenter) return null;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-50">Recruiter Operations Center</h2>
              <span className="rounded-full border border-teal-500/35 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-100">
                Read-only
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Unified recruiter work queue — prioritization and visibility only
            </p>
            <p className="mt-1 text-xs text-zinc-500">Fetched {formatTimestamp(commandCenter.fetchedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load(recruiterFilter)}
              disabled={loading}
              className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <CandidateExcelExportControls
              exportScope={exportScope}
              onExportScopeChange={setExportScope}
              onExport={handleExport}
              exporting={exporting}
              disabled={loading}
              exportError={exportError}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {commandCenter.kpis.map((kpi) => (
            <MetricCard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value.toLocaleString()}
              hint={kpi.hint}
              alert={kpi.alert}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Filters</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Search
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name, email, position, recruiter…"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            />
          </label>

          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Recruiter
            <select
              value={recruiterFilter}
              onChange={(event) => setRecruiterFilter(event.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All recruiters</option>
              {commandCenter.recruiterSummaries.map((summary) => (
                <option key={summary.recruiter} value={summary.recruiter}>
                  {summary.recruiter} ({summary.totalWorkItems})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Priority
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as RecruiterWorkCategoryId | "all")}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All</option>
              {(Object.keys(RECRUITER_WORK_CATEGORY_LABELS) as RecruiterWorkCategoryId[]).map((id) => (
                <option key={id} value={id}>
                  {RECRUITER_WORK_CATEGORY_LABELS[id]} ({commandCenter.queueCounts[id]})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Action
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Coverage
            <select
              value={coverageFilter}
              onChange={(event) => setCoverageFilter(event.target.value as CoverageFilter)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All</option>
              <option value="urgent">Critical / At Risk</option>
              <option value="healthy">Healthy / Watch</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            Overdue
            <select
              value={overdueFilter}
              onChange={(event) => setOverdueFilter(event.target.value as OverdueFilter)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All</option>
              <option value="overdue">Overdue only</option>
              <option value="current">Not overdue</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-red-500/25 bg-zinc-950/30 p-2">
        <h3 className="px-2 py-2 text-sm font-semibold text-red-100">
          Today&apos;s priorities ({filteredTopPriorities.length})
        </h3>
        <WorkQueueTable
          rows={filteredTopPriorities}
          referenceMs={referenceMs}
          selectedIds={selectedIds}
          onToggleRow={toggleRowSelection}
          onToggleAll={toggleAllSelection}
          showSelection={exportScope === "selected"}
        />
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
          <h3 className="text-sm font-semibold text-zinc-100">
            Unified work queue ({filteredQueue.length})
          </h3>
          {exportScope === "selected" ? (
            <p className="text-[10px] text-zinc-500">{selectedIds.size} selected</p>
          ) : null}
        </div>
        <WorkQueueTable
          rows={filteredQueue}
          referenceMs={referenceMs}
          selectedIds={selectedIds}
          onToggleRow={toggleRowSelection}
          onToggleAll={toggleAllSelection}
          showSelection={exportScope === "selected"}
        />
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2">
        <h3 className="px-2 py-2 text-sm font-semibold text-zinc-100">Recruiter summaries</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-500">
                <th className="px-2 py-2 font-medium">Recruiter</th>
                <th className="px-2 py-2 font-medium">Work items</th>
                <th className="px-2 py-2 font-medium">High priority</th>
                <th className="px-2 py-2 font-medium">Overdue</th>
                <th className="px-2 py-2 font-medium">SLA risks</th>
              </tr>
            </thead>
            <tbody>
              {commandCenter.recruiterSummaries.map((summary) => (
                <tr key={summary.recruiter} className="border-t border-zinc-800/60 text-zinc-200">
                  <td className="px-2 py-2">{summary.recruiter}</td>
                  <td className="px-2 py-2 tabular-nums">{summary.totalWorkItems}</td>
                  <td className="px-2 py-2 tabular-nums">{summary.highPriorityCount}</td>
                  <td className="px-2 py-2 tabular-nums">{summary.overdueCount}</td>
                  <td className="px-2 py-2 tabular-nums">{summary.slaRiskCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
