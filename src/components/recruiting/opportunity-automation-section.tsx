"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import {
  buildOpportunityAutomationSnapshot,
  type AutomationAction,
  type AutomationActionBadge,
  type AutomationPriorityLevel,
  type OpportunityAutomationRow,
} from "@/lib/opportunity-automation";
import type { Kpi } from "@/lib/recruiting-sample-data";
import { useMemo, useState } from "react";
import { KpiCards } from "./kpi-cards";

type OpportunityAutomationSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

const ALL = "__all__";

const selectClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

const ACTION_BADGE_STYLES: Record<AutomationActionBadge, string> = {
  Auto: "border-sky-500/25 bg-sky-500/10 text-sky-200",
  "Needs Review": "border-amber-500/25 bg-amber-500/10 text-amber-200",
  Critical: "border-red-500/30 bg-red-500/15 text-red-200",
  "Ready To Execute": "border-teal-500/25 bg-teal-500/10 text-teal-200",
};

const PRIORITY_BADGE_STYLES: Record<AutomationPriorityLevel, string> = {
  Critical: "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
  High: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  Medium: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30",
  Low: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
};

const ACTION_STYLES: Record<AutomationAction, string> = {
  "Increase posts": "border-sky-500/25 bg-sky-500/10 text-sky-200",
  "Expand recruiting radius": "border-violet-500/25 bg-violet-500/10 text-violet-200",
  "Increase pay": "border-amber-500/25 bg-amber-500/10 text-amber-200",
  "Escalate to recruiting": "border-red-500/30 bg-red-500/15 text-red-200",
  "Reassign reps": "border-teal-500/25 bg-teal-500/10 text-teal-200",
  "Pause recruiting": "border-zinc-500/25 bg-zinc-500/10 text-zinc-200",
  "Close recruiting post": "border-zinc-500/25 bg-zinc-500/10 text-zinc-200",
  "Open new market": "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  "Push mass opportunities": "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-200",
};

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function automationKpis(snapshot: ReturnType<typeof buildOpportunityAutomationSnapshot>): Kpi[] {
  return [
    {
      id: "auto-actions",
      label: "Auto Actions Available",
      value: snapshot.kpis.autoActionsAvailable.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: "Auto or ready-to-execute opportunities from current rules",
    },
    {
      id: "critical-automations",
      label: "Critical Automations",
      value: snapshot.kpis.criticalAutomations.toLocaleString(),
      change: "Live",
      changeDirection: snapshot.kpis.criticalAutomations > 0 ? "down" : "flat",
      hint: "Automation score >= 80",
    },
    {
      id: "markets-pause",
      label: "Markets To Pause",
      value: snapshot.kpis.marketsToPause.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: "Pause or close recommendations",
    },
    {
      id: "markets-expand",
      label: "Markets To Expand",
      value: snapshot.kpis.marketsToExpand.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: "Expand radius or open new market recommendations",
    },
    {
      id: "reassign",
      label: "Reassign Opportunities",
      value: snapshot.kpis.reassignOpportunities.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: "Rep coverage gaps that need rebalancing",
    },
  ];
}

function filterRows(
  rows: OpportunityAutomationRow[],
  dmFilter: string,
  actionFilter: string,
  stateFilter: string,
  priorityFilter: string,
): OpportunityAutomationRow[] {
  return rows
    .filter((row) => dmFilter === ALL || row.dm === dmFilter)
    .filter((row) => actionFilter === ALL || row.recommendedAction === actionFilter)
    .filter((row) => stateFilter === ALL || row.state === stateFilter)
    .filter((row) => priorityFilter === ALL || row.suggestedPriorityLevel === priorityFilter);
}

function AutomationCards({ rows }: { rows: OpportunityAutomationRow[] }) {
  return (
    <div className="space-y-3 lg:hidden">
      {rows.map((row) => (
        <article
          key={`${row.market}-${row.recommendedAction}`}
          className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-zinc-50">{row.market}</h3>
              <p className="text-sm text-zinc-500">{row.dm}</p>
            </div>
            <span
              className={[
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                PRIORITY_BADGE_STYLES[row.suggestedPriorityLevel],
              ].join(" ")}
            >
              {row.suggestedPriorityLevel}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={[
                "rounded-md border px-2 py-1 text-xs font-medium",
                ACTION_STYLES[row.recommendedAction],
              ].join(" ")}
            >
              {row.recommendedAction}
            </span>
            <span
              className={[
                "rounded-md border px-2 py-1 text-xs font-medium",
                ACTION_BADGE_STYLES[row.actionBadge],
              ].join(" ")}
            >
              {row.actionBadge}
            </span>
            <span className="rounded-md border border-teal-500/25 bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-200">
              Score {row.automationScore}
            </span>
          </div>

          <p className="mt-3 text-sm text-zinc-400">{row.reason}</p>
          <p className="mt-2 text-xs text-zinc-500">Deadline: {row.deadline}</p>
        </article>
      ))}
    </div>
  );
}

function AutomationTable({ rows }: { rows: OpportunityAutomationRow[] }) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium sm:px-5">Priority</th>
            <th className="px-4 py-3 font-medium sm:px-5">Market</th>
            <th className="px-4 py-3 font-medium sm:px-5">State</th>
            <th className="px-4 py-3 font-medium sm:px-5">DM</th>
            <th className="px-4 py-3 font-medium sm:px-5">Recommended Action</th>
            <th className="px-4 py-3 font-medium sm:px-5">Reason</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Automation Score</th>
            <th className="px-4 py-3 font-medium sm:px-5">Deadline</th>
            <th className="px-4 py-3 font-medium sm:px-5">Suggested Priority Level</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((row) => (
            <tr key={`${row.market}-${row.recommendedAction}`} className="hover:bg-zinc-800/30">
              <td className="px-4 py-3 sm:px-5">
                <span
                  className={[
                    "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                    ACTION_BADGE_STYLES[row.actionBadge],
                  ].join(" ")}
                >
                  {row.actionBadge}
                </span>
              </td>
              <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.market}</td>
              <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.state}</td>
              <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.dm}</td>
              <td className="px-4 py-3 sm:px-5">
                <span
                  className={[
                    "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                    ACTION_STYLES[row.recommendedAction],
                  ].join(" ")}
                >
                  {row.recommendedAction}
                </span>
              </td>
              <td className="max-w-xs px-4 py-3 text-zinc-400 sm:px-5">{row.reason}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-teal-300 sm:px-5">
                {row.automationScore}
              </td>
              <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.deadline}</td>
              <td className="px-4 py-3 sm:px-5">
                <span
                  className={[
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                    PRIORITY_BADGE_STYLES[row.suggestedPriorityLevel],
                  ].join(" ")}
                >
                  {row.suggestedPriorityLevel}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpportunityAutomationSection({ recruiting, mel }: OpportunityAutomationSectionProps) {
  const [dmFilter, setDmFilter] = useState(ALL);
  const [actionFilter, setActionFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);

  const snapshot = useMemo(() => {
    if (!recruiting.ok || !mel.ok) return null;
    return buildOpportunityAutomationSnapshot(recruiting.rows, recruiting.headers, mel.rows, mel.headers);
  }, [mel, recruiting]);

  const filteredRows = useMemo(() => {
    if (!snapshot) return [];
    return filterRows(snapshot.rows, dmFilter, actionFilter, stateFilter, priorityFilter);
  }, [actionFilter, dmFilter, priorityFilter, snapshot, stateFilter]);

  const dmOptions = useMemo(
    () => sortedUnique(snapshot?.rows.map((row) => row.dm) ?? []),
    [snapshot],
  );
  const stateOptions = useMemo(
    () => sortedUnique(snapshot?.rows.map((row) => row.state) ?? []),
    [snapshot],
  );
  const actionOptions = useMemo(
    () => sortedUnique(snapshot?.rows.map((row) => row.recommendedAction) ?? []) as AutomationAction[],
    [snapshot],
  );

  if (!recruiting.ok || !mel.ok) {
    const error = !recruiting.ok ? recruiting.error : !mel.ok ? mel.error : "Unable to load automation data";
    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Automation Queue</h2>
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {error}
        </div>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <section
      aria-labelledby="opportunity-automation-heading"
      className="space-y-6 border-t border-zinc-800/80 pt-8"
    >
      <div>
        <h2 id="opportunity-automation-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          Automation Queue
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Automation rules that convert recruiting and MEL intelligence into operational actions.
        </p>
      </div>

      <KpiCards
        items={automationKpis(snapshot)}
        gridClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      />

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="grid gap-3 border-b border-zinc-800/80 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">DM</span>
            <select className={selectClass} value={dmFilter} onChange={(e) => setDmFilter(e.target.value)}>
              <option value={ALL}>All DMs</option>
              {dmOptions.map((dm) => (
                <option key={dm} value={dm}>
                  {dm}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Action type</span>
            <select
              className={selectClass}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value={ALL}>All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">State</span>
            <select className={selectClass} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value={ALL}>All states</option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Priority level</span>
            <select
              className={selectClass}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value={ALL}>All priorities</option>
              {(["Critical", "High", "Medium", "Low"] satisfies AutomationPriorityLevel[]).map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredRows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">
            No automation opportunities match the selected filters.
          </p>
        ) : (
          <div className="px-4 py-4 sm:px-5">
            <AutomationCards rows={filteredRows} />
            <AutomationTable rows={filteredRows} />
          </div>
        )}
      </div>
    </section>
  );
}
