"use client";

import type { DmAttentionCategory } from "@/lib/dm-dashboard";
import type {
  DmAlertPriority,
  DmAlertPriorityFilter,
  DmAlertSortMode,
  DmPrioritizedAlert,
} from "@/lib/dm-dashboard/dm-alert-priority";
import {
  filterPrioritizedAlerts,
  sortPrioritizedAlerts,
} from "@/lib/dm-dashboard/dm-alert-priority";
import { useMemo, useState } from "react";

const PRIORITY_OPTIONS: Array<{ id: DmAlertPriorityFilter; label: string }> = [
  { id: "all", label: "All priorities" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

const SORT_OPTIONS: Array<{ id: DmAlertSortMode; label: string }> = [
  { id: "highest-risk", label: "Highest risk" },
  { id: "oldest", label: "Oldest first" },
];

const CATEGORY_OPTIONS: Array<{ id: DmAttentionCategory | "all"; label: string }> = [
  { id: "all", label: "All alert types" },
  { id: "no-applicants-7d", label: "No applicants" },
  { id: "job-aging-30", label: "Job aging 30d+" },
  { id: "job-aging-14", label: "Job aging 14–21d" },
  { id: "job-aging-21", label: "Job aging 21d+" },
  { id: "low-applicant-flow", label: "Low applicant flow" },
  { id: "low-applicant-flow-city", label: "City drought" },
  { id: "no-interviews", label: "No interviews" },
  { id: "low-interview-conversion", label: "Low conversion" },
];

function priorityStyles(priority: DmAlertPriority): string {
  switch (priority) {
    case "critical":
      return "border-red-500 bg-red-500/20 text-red-50 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]";
    case "high":
      return "border-orange-500/70 bg-orange-500/15 text-orange-50";
    case "medium":
      return "border-amber-500/50 bg-amber-500/10 text-amber-50";
    default:
      return "border-zinc-700/80 bg-zinc-900/40 text-zinc-300";
  }
}

function priorityBadge(priority: DmAlertPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-500 text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-amber-500 text-zinc-950";
    default:
      return "bg-zinc-700 text-zinc-200";
  }
}

type DmPriorityAlertsPanelProps = {
  alerts: DmPrioritizedAlert[];
};

export function DmPriorityAlertsPanel({ alerts }: DmPriorityAlertsPanelProps) {
  const [priorityFilter, setPriorityFilter] = useState<DmAlertPriorityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<DmAttentionCategory | "all">("all");
  const [sortMode, setSortMode] = useState<DmAlertSortMode>("highest-risk");

  const visible = useMemo(() => {
    const filtered = filterPrioritizedAlerts(alerts, {
      priority: priorityFilter,
      category: categoryFilter,
    });
    return sortPrioritizedAlerts(filtered, sortMode);
  }, [alerts, categoryFilter, priorityFilter, sortMode]);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Priority command queue</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ranked operational alerts with recommended next actions for your territory.
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          Showing {visible.length} of {alerts.length}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as DmAlertPriorityFilter)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
          aria-label="Filter by priority"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(event) =>
            setCategoryFilter(event.target.value as DmAttentionCategory | "all")
          }
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
          aria-label="Filter by alert type"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as DmAlertSortMode)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
          aria-label="Sort alerts"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No alerts match the current filters.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {visible.map((alert) => (
            <li
              key={alert.id}
              className={`rounded-lg border px-3 py-3 text-sm ${priorityStyles(alert.priority)}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadge(alert.priority)}`}
                >
                  {alert.priority}
                </span>
                <span className="text-[10px] uppercase tracking-wide opacity-80">
                  {alert.alertTypeLabel}
                </span>
                {alert.ageDays > 0 ? (
                  <span className="text-[10px] tabular-nums opacity-70">{alert.ageDays}d signal</span>
                ) : null}
              </div>
              <p className="mt-2 font-medium">{alert.title}</p>
              <p className="mt-0.5 text-xs opacity-90">{alert.detail}</p>
              <p className="mt-2 text-xs font-medium text-teal-200/95">
                Recommended: {alert.recommendedAction}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
