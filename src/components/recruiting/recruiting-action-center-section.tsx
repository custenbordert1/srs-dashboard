"use client";

import type { BreezyCandidatesResult } from "@/lib/breezy-api";
import { buildCandidateIntelligence } from "@/lib/candidate-intelligence";
import type { SheetDataResult } from "@/lib/google-sheet-csv";
import {
  normalizeMarketKey,
  resolveMarketIdentity,
} from "@/lib/market-identity";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { resolveMelProjectColumnKeys } from "@/lib/mel-projects-metrics";
import {
  buildOpportunityAutomationSnapshot,
  type AutomationPriorityLevel,
} from "@/lib/opportunity-automation";
import { parseApplicantCount } from "@/lib/post-automation";
import {
  buildRecruiterWorkload,
  createWorkflowActivity,
  isWorkflowOverdue,
  mergeWorkflowState,
  URGENCY_OPTIONS,
  workloadTotals,
  WORKFLOW_STATUSES,
  type PersistedWorkflowState,
  type RecruitingActionWorkflow,
  type WorkflowStateById,
  type WorkflowStatus,
} from "@/lib/recruiting-action-center";
import { buildRecruitingForecast } from "@/lib/recruiting-forecast";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";
import { Fragment, useEffect, useMemo, useState } from "react";
import { KpiCards } from "./kpi-cards";

type RecruitingActionCenterSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

const STORAGE_KEY = "srs-dashboard:recruiting-action-center:v1";
const ALL = "__all__";
const MEL_CITY_ALIASES = ["city", "location city", "store city"];
const DETAIL_TABS = ["Overview", "Recruiting", "MEL Projects", "Automation", "Forecast"] as const;

type DetailTab = (typeof DETAIL_TABS)[number];

const selectClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

const STATUS_STYLES: Record<WorkflowStatus, string> = {
  New: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30",
  Assigned: "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30",
  "In Progress": "bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30",
  Waiting: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
  Completed: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
  Escalated: "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
};

const URGENCY_STYLES: Record<AutomationPriorityLevel, string> = {
  Critical: "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
  High: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  Medium: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30",
  Low: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
};

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }
  for (const alias of aliases) {
    const direct = set.get(normHeader(alias));
    if (direct) return direct;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n === a || n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

function cell(row: Record<string, string>, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatSnooze(iso: string | null): string {
  if (!iso) return "Not snoozed";
  return `Snoozed until ${formatDateTime(iso)}`;
}

function readStoredState(): WorkflowStateById {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WorkflowStateById;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function workflowKpis(workloads: ReturnType<typeof buildRecruiterWorkload>) {
  const totals = workloadTotals(workloads);
  return [
    {
      id: "active-actions",
      label: "Active actions",
      value: totals.activeActions.toLocaleString(),
      change: "Local",
      changeDirection: "flat" as const,
      hint: "All non-completed workflow actions",
    },
    {
      id: "completed-today",
      label: "Completed today",
      value: totals.completedToday.toLocaleString(),
      change: "Today",
      changeDirection: "up" as const,
      hint: "Actions marked completed today",
    },
    {
      id: "overdue-actions",
      label: "Overdue actions",
      value: totals.overdueActions.toLocaleString(),
      change: "Local",
      changeDirection: totals.overdueActions > 0 ? ("down" as const) : ("flat" as const),
      hint: "Past deadline or snooze date",
    },
    {
      id: "critical-actions",
      label: "Critical actions",
      value: totals.criticalActions.toLocaleString(),
      change: "Live",
      changeDirection: totals.criticalActions > 0 ? ("down" as const) : ("flat" as const),
      hint: "Critical automation recommendations not completed",
    },
  ];
}

function actionButtonClass(tone: "default" | "teal" | "amber" | "red" = "default") {
  const tones = {
    default: "border-zinc-700 bg-zinc-950/70 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-200 hover:bg-teal-500/15",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15",
    red: "border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15",
  };
  return `rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${tones[tone]}`;
}

export function RecruitingActionCenterSection({ recruiting, mel }: RecruitingActionCenterSectionProps) {
  const [stateById, setStateById] = useState<WorkflowStateById>({});
  const [hydrated, setHydrated] = useState(false);
  const [recruiterFilter, setRecruiterFilter] = useState(ALL);
  const [dmFilter, setDmFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [urgencyFilter, setUrgencyFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [detailTabs, setDetailTabs] = useState<Record<string, DetailTab>>({});
  const [candidateData, setCandidateData] = useState<BreezyCandidatesResult | undefined>(undefined);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setStateById(readStoredState());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateById));
  }, [hydrated, stateById]);

  useEffect(() => {
    let cancelled = false;

    async function loadCandidates() {
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

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = useMemo(() => {
    if (!recruiting.ok || !mel.ok) return null;
    return buildOpportunityAutomationSnapshot(recruiting.rows, recruiting.headers, mel.rows, mel.headers);
  }, [mel, recruiting]);

  const workflows = useMemo(
    () => mergeWorkflowState(snapshot?.rows ?? [], stateById),
    [snapshot, stateById],
  );

  const workloads = useMemo(() => buildRecruiterWorkload(workflows), [workflows]);

  const melKeys = useMemo(() => (mel.ok ? resolveMelProjectColumnKeys(mel.headers) : null), [mel]);
  const melCityKey = useMemo(
    () => (mel.ok ? pickColumn(mel.headers, MEL_CITY_ALIASES) : undefined),
    [mel],
  );
  const recruitingKeys = useMemo(
    () => (recruiting.ok ? resolveKpiSheetColumnKeys(recruiting.headers) : null),
    [recruiting],
  );
  const candidateSnapshot = useMemo(
    () => (candidateData?.ok ? buildCandidateIntelligence(candidateData.candidates) : null),
    [candidateData],
  );
  const forecastSnapshot = useMemo(() => {
    if (!recruiting.ok || !mel.ok || !candidateData?.ok) return null;
    return buildRecruitingForecast({
      recruitingRows: recruiting.rows,
      recruitingHeaders: recruiting.headers,
      melRows: mel.rows,
      melHeaders: mel.headers,
      candidates: candidateData.candidates,
    });
  }, [candidateData, mel, recruiting]);

  const recruiterOptions = useMemo(
    () => sortedUnique(workflows.map((workflow) => workflow.assignedRecruiter || "Unassigned")),
    [workflows],
  );
  const dmOptions = useMemo(
    () => sortedUnique(workflows.map((workflow) => workflow.assignedDm)),
    [workflows],
  );
  const stateOptions = useMemo(
    () => sortedUnique(workflows.map((workflow) => workflow.state)),
    [workflows],
  );

  const filteredWorkflows = useMemo(
    () =>
      workflows
        .filter((workflow) => {
          const recruiter = workflow.assignedRecruiter || "Unassigned";
          return recruiterFilter === ALL || recruiter === recruiterFilter;
        })
        .filter((workflow) => dmFilter === ALL || workflow.assignedDm === dmFilter)
        .filter((workflow) => stateFilter === ALL || workflow.state === stateFilter)
        .filter(
          (workflow) =>
            urgencyFilter === ALL || workflow.suggestedPriorityLevel === urgencyFilter,
        )
        .filter((workflow) => statusFilter === ALL || workflow.workflowStatus === statusFilter),
    [dmFilter, recruiterFilter, stateFilter, statusFilter, urgencyFilter, workflows],
  );

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setDetailTab(id: string, tab: DetailTab) {
    setDetailTabs((prev) => ({ ...prev, [id]: tab }));
  }

  function updateWorkflow(
    workflow: RecruitingActionWorkflow,
    patch: Partial<PersistedWorkflowState>,
    event: ReturnType<typeof createWorkflowActivity>,
  ) {
    setStateById((prev) => {
      const existing = prev[workflow.id] ?? {
        status: workflow.workflowStatus,
        recruiter: workflow.assignedRecruiter,
        dm: workflow.assignedDm,
        snoozedUntil: workflow.snoozedUntil,
        notes: workflow.notes,
        activity: workflow.activity,
      };
      return {
        ...prev,
        [workflow.id]: {
          ...existing,
          ...patch,
          activity: [event, ...existing.activity].slice(0, 25),
        },
      };
    });
  }

  function setStatus(workflow: RecruitingActionWorkflow, status: WorkflowStatus) {
    updateWorkflow(
      workflow,
      { status, snoozedUntil: status === "Completed" ? null : workflow.snoozedUntil },
      createWorkflowActivity("status", `Status changed to ${status}.`),
    );
  }

  function assignRecruiter(workflow: RecruitingActionWorkflow) {
    const recruiter = window.prompt("Assign to recruiter", workflow.assignedRecruiter);
    if (!recruiter?.trim()) return;
    updateWorkflow(
      workflow,
      { recruiter: recruiter.trim(), status: "Assigned" },
      createWorkflowActivity("assignment", `Assigned to recruiter ${recruiter.trim()}.`),
    );
  }

  function assignDm(workflow: RecruitingActionWorkflow) {
    const dm = window.prompt("Assign to DM", workflow.assignedDm);
    if (!dm?.trim()) return;
    updateWorkflow(
      workflow,
      { dm: dm.trim(), status: "Assigned" },
      createWorkflowActivity("assignment", `Assigned to DM ${dm.trim()}.`),
    );
  }

  function snoozeWorkflow(workflow: RecruitingActionWorkflow) {
    const daysRaw = window.prompt("Snooze for how many days?", "3");
    const days = Number.parseInt(daysRaw ?? "", 10);
    if (!Number.isFinite(days) || days <= 0) return;
    const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    updateWorkflow(
      workflow,
      { snoozedUntil, status: "Waiting" },
      createWorkflowActivity("snooze", `Snoozed for ${days} day${days === 1 ? "" : "s"}.`),
    );
  }

  function escalateWorkflow(workflow: RecruitingActionWorkflow) {
    updateWorkflow(
      workflow,
      { status: "Escalated" },
      createWorkflowActivity("escalation", "Escalated for leadership review."),
    );
  }

  function addNote(workflow: RecruitingActionWorkflow) {
    const note = window.prompt("Add workflow note");
    if (!note?.trim()) return;
    setStateById((prev) => {
      const existing = prev[workflow.id] ?? {
        status: workflow.workflowStatus,
        recruiter: workflow.assignedRecruiter,
        dm: workflow.assignedDm,
        snoozedUntil: workflow.snoozedUntil,
        notes: workflow.notes,
        activity: workflow.activity,
      };
      return {
        ...prev,
        [workflow.id]: {
          ...existing,
          notes: [note.trim(), ...existing.notes].slice(0, 10),
          activity: [
            createWorkflowActivity("note", `Note added: ${note.trim()}`),
            ...existing.activity,
          ].slice(0, 25),
        },
      };
    });
  }

  if (!recruiting.ok || !mel.ok) {
    const error = !recruiting.ok ? recruiting.error : !mel.ok ? mel.error : "Unable to load action center";
    return (
      <section className="space-y-4 border-t border-zinc-800/80 pt-8">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Recruiting Action Center</h2>
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
    <section aria-labelledby="action-center-heading" className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div>
        <h2 id="action-center-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          Recruiting Action Center
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Turn automation recommendations into executable local workflows with assignments, status,
          notes, snoozes, escalations, and activity history.
        </p>
      </div>

      <KpiCards items={workflowKpis(workloads)} gridClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" />

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-50">Recruiter workload</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Local workload tracking across active, completed, overdue, and critical actions.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Recruiter</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Active actions</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Completed today</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Overdue actions</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Critical actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {workloads.map((row) => (
                <tr key={row.recruiter} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.recruiter}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                    {row.activeActions}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                    {row.completedToday}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-200 sm:px-5">
                    {row.overdueActions}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-200 sm:px-5">
                    {row.criticalActions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="grid gap-3 border-b border-zinc-800/80 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5 sm:px-5">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Recruiter</span>
            <select
              className={selectClass}
              value={recruiterFilter}
              onChange={(e) => setRecruiterFilter(e.target.value)}
            >
              <option value={ALL}>All recruiters</option>
              {recruiterOptions.map((recruiter) => (
                <option key={recruiter} value={recruiter}>
                  {recruiter}
                </option>
              ))}
            </select>
          </label>
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
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Urgency</span>
            <select
              className={selectClass}
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value={ALL}>All urgencies</option>
              {URGENCY_OPTIONS.map((urgency) => (
                <option key={urgency} value={urgency}>
                  {urgency}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Workflow status</span>
            <select
              className={selectClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value={ALL}>All statuses</option>
              {WORKFLOW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredWorkflows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">
            No action workflows match the selected filters.
          </p>
        ) : (
          <div className="max-h-[42rem] overflow-auto">
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium sm:px-5">Market</th>
                  <th className="px-4 py-3 font-medium sm:px-5">State</th>
                  <th className="px-4 py-3 font-medium sm:px-5">DM</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Recruiter</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Priority</th>
                  <th className="px-4 py-3 font-medium text-right sm:px-5">Automation Score</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Workflow Status</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Deadline</th>
                  <th className="px-4 py-3 font-medium sm:px-5">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredWorkflows.slice(0, 100).map((workflow) => {
                  const expanded = expandedIds.has(workflow.id);
                  const escalationHistory = workflow.activity.filter(
                    (event) => event.type === "escalation" || event.message.includes("Escalated"),
                  );
                  const normalizedMarketKey = normalizeMarketKey(workflow.city, workflow.state);
                  const activeTab = detailTabs[workflow.id] ?? "Overview";
                  const marketMelProjects =
                    mel.ok && melKeys
                      ? mel.rows
                          .filter((row) => {
                            const identity = resolveMarketIdentity({
                              city: cell(row, melCityKey) || cell(row, melKeys.storeName),
                              state: cell(row, melKeys.state),
                              manager: cell(row, melKeys.manager),
                              source: "mel",
                            });
                            return identity.key === normalizedMarketKey;
                          })
                          .slice(0, 12)
                      : [];
                  const marketRecruitingPosts =
                    recruiting.ok && recruitingKeys
                      ? recruiting.rows
                          .filter((row) => {
                            const identity = resolveMarketIdentity({
                              city: cell(row, recruitingKeys.city),
                              state: cell(row, recruitingKeys.state),
                              manager: cell(row, recruitingKeys.manager),
                              source: "recruiting",
                            });
                            return identity.key === normalizedMarketKey;
                          })
                          .slice(0, 12)
                      : [];
                  const marketCandidates =
                    candidateSnapshot?.rows.filter(
                      (candidate) => normalizeMarketKey(candidate.city, candidate.state) === normalizedMarketKey,
                    ) ?? [];
                  const candidateStatusCounts = [...marketCandidates.reduce((map, candidate) => {
                    map.set(candidate.status, (map.get(candidate.status) ?? 0) + 1);
                    return map;
                  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
                  const forecast = forecastSnapshot?.forecast30Day.find(
                    (row) => normalizeMarketKey(row.city, row.state) === normalizedMarketKey,
                  );

                  return (
                    <Fragment key={workflow.id}>
                      <tr
                        onClick={() => toggleExpanded(workflow.id)}
                        className={[
                          "cursor-pointer hover:bg-zinc-800/30",
                          isWorkflowOverdue(workflow) ? "bg-amber-500/[0.03]" : "",
                        ].join(" ")}
                      >
                        <td className="px-4 py-3 sm:px-5">
                          <div className="flex min-w-0 items-center gap-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded(workflow.id);
                              }}
                              aria-expanded={expanded}
                              className="shrink-0 rounded-md border border-zinc-700 bg-zinc-950/70 px-2 py-1 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                            >
                              {expanded ? "Collapse" : "Expand"}
                            </button>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-zinc-100">{workflow.market}</p>
                              <p className="mt-0.5 truncate text-xs text-zinc-500">{workflow.reason}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 sm:px-5">{workflow.state}</td>
                        <td className="px-4 py-3 text-zinc-400 sm:px-5">{workflow.assignedDm}</td>
                        <td className="px-4 py-3 text-zinc-300 sm:px-5">
                          {workflow.assignedRecruiter || "Unassigned"}
                        </td>
                        <td className="px-4 py-3 sm:px-5">
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              URGENCY_STYLES[workflow.suggestedPriorityLevel],
                            ].join(" ")}
                          >
                            {workflow.suggestedPriorityLevel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-teal-300 sm:px-5">
                          {workflow.automationScore}
                        </td>
                        <td className="px-4 py-3 sm:px-5">
                          <span
                            className={[
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              STATUS_STYLES[workflow.workflowStatus],
                            ].join(" ")}
                          >
                            {workflow.workflowStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-300 sm:px-5">{workflow.deadline}</td>
                        <td className="px-4 py-3 text-zinc-300 sm:px-5">{workflow.recommendedAction}</td>
                      </tr>
                      {expanded ? (
                        <tr key={`${workflow.id}-expanded`} className="bg-zinc-950/40">
                          <td colSpan={9} className="px-4 py-4 sm:px-5">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
                              <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <h3 className="text-lg font-semibold text-zinc-50">{workflow.market}</h3>
                                  <p className="mt-1 font-mono text-xs text-teal-300">{normalizedMarketKey}</p>
                                  <p className="mt-2 text-sm text-zinc-500">{workflow.reason}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:min-w-[32rem]">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-zinc-500">Open calls</p>
                                    <p className="mt-1 font-semibold tabular-nums text-zinc-100">{workflow.openStoreCalls}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-zinc-500">Active reps</p>
                                    <p className="mt-1 font-semibold tabular-nums text-zinc-100">{workflow.activeReps}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-zinc-500">Open posts</p>
                                    <p className="mt-1 font-semibold tabular-nums text-zinc-100">{workflow.openRecruitingPosts}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-zinc-500">Applicants</p>
                                    <p className="mt-1 font-semibold tabular-nums text-zinc-100">{workflow.applicants}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {DETAIL_TABS.map((tab) => (
                                  <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setDetailTab(workflow.id, tab)}
                                    className={[
                                      "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                                      activeTab === tab
                                        ? "bg-teal-500/15 text-teal-200"
                                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                                    ].join(" ")}
                                  >
                                    {tab}
                                  </button>
                                ))}
                              </div>

                              <div className="p-4">
                                {activeTab === "Overview" ? (
                                  <div className="grid gap-4 lg:grid-cols-3">
                                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Assignments</h4>
                                      <dl className="mt-3 space-y-2 text-sm">
                                        <div className="flex justify-between gap-3">
                                          <dt className="text-zinc-500">Recruiter</dt>
                                          <dd className="font-medium text-zinc-200">{workflow.assignedRecruiter || "Unassigned"}</dd>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                          <dt className="text-zinc-500">DM</dt>
                                          <dd className="font-medium text-zinc-200">{workflow.assignedDm}</dd>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                          <dt className="text-zinc-500">Workflow</dt>
                                          <dd className="font-medium text-zinc-200">{workflow.workflowStatus}</dd>
                                        </div>
                                      </dl>
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Forecast risk</h4>
                                      {forecast ? (
                                        <dl className="mt-3 space-y-2 text-sm">
                                          <div className="flex justify-between gap-3">
                                            <dt className="text-zinc-500">30d risk</dt>
                                            <dd className="font-semibold tabular-nums text-teal-300">{forecast.forecastRiskScore}</dd>
                                          </div>
                                          <div className="flex justify-between gap-3">
                                            <dt className="text-zinc-500">Urgency</dt>
                                            <dd className="font-medium text-zinc-200">{forecast.urgency}</dd>
                                          </div>
                                          <div className="flex justify-between gap-3">
                                            <dt className="text-zinc-500">Rep shortage</dt>
                                            <dd className="font-medium tabular-nums text-zinc-200">{forecast.projectedRepShortage}</dd>
                                          </div>
                                        </dl>
                                      ) : (
                                        <p className="mt-3 text-sm text-zinc-500">Forecast unavailable until Breezy candidates load.</p>
                                      )}
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Candidate pipeline</h4>
                                      {candidateStatusCounts.length > 0 ? (
                                        <ul className="mt-3 space-y-2 text-sm">
                                          {candidateStatusCounts.slice(0, 5).map(([status, count]) => (
                                            <li key={status} className="flex justify-between gap-3">
                                              <span className="text-zinc-400">{status}</span>
                                              <span className="font-medium tabular-nums text-zinc-200">{count}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="mt-3 text-sm text-zinc-500">No mapped Breezy candidates for this market.</p>
                                      )}
                                    </div>
                                  </div>
                                ) : null}

                                {activeTab === "Recruiting" ? (
                                  <div className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-3">
                                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500">Open recruiting posts</p>
                                        <p className="mt-1 text-2xl font-semibold text-zinc-50">{workflow.openRecruitingPosts}</p>
                                      </div>
                                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500">Applicants</p>
                                        <p className="mt-1 text-2xl font-semibold text-zinc-50">{workflow.applicants}</p>
                                      </div>
                                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                        <p className="text-xs uppercase tracking-wide text-zinc-500">Candidate records</p>
                                        <p className="mt-1 text-2xl font-semibold text-zinc-50">{marketCandidates.length}</p>
                                      </div>
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-zinc-800">
                                      <table className="min-w-[620px] w-full text-left text-sm">
                                        <thead className="bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
                                          <tr>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                            <th className="px-3 py-2 font-medium text-right">Applicants</th>
                                            <th className="px-3 py-2 font-medium">Source row</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800">
                                          {marketRecruitingPosts.map((row, index) => (
                                            <tr key={`${workflow.id}-rec-${index}`}>
                                              <td className="px-3 py-2 text-zinc-300">{cell(row, recruitingKeys?.status) || "—"}</td>
                                              <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{parseApplicantCount(cell(row, recruitingKeys?.applicantCount))}</td>
                                              <td className="px-3 py-2 text-zinc-500">
                                                {isOpenPostStatus(cell(row, recruitingKeys?.status)) ? "Open/Requested" : "Other"}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ) : null}

                                {activeTab === "MEL Projects" ? (
                                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                                    <table className="min-w-[760px] w-full text-left text-sm">
                                      <thead className="bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
                                        <tr>
                                          <th className="px-3 py-2 font-medium">Project</th>
                                          <th className="px-3 py-2 font-medium">Store call</th>
                                          <th className="px-3 py-2 font-medium">Status</th>
                                          <th className="px-3 py-2 font-medium">Rep</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-800">
                                        {marketMelProjects.map((row, index) => (
                                          <tr key={`${workflow.id}-mel-${index}`}>
                                            <td className="px-3 py-2">
                                              <p className="font-medium text-zinc-200">{cell(row, melKeys?.projectName) || "Untitled project"}</p>
                                              <p className="text-xs text-zinc-500">{cell(row, melKeys?.projectNo) || "—"}</p>
                                            </td>
                                            <td className="px-3 py-2 text-zinc-300">{cell(row, melKeys?.storeCall) || "—"}</td>
                                            <td className="px-3 py-2 text-zinc-300">{cell(row, melKeys?.status) || "—"}</td>
                                            <td className="px-3 py-2 text-zinc-400">{cell(row, melKeys?.staffName) || "Open"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : null}

                                {activeTab === "Automation" ? (
                                  <div className="grid gap-4 lg:grid-cols-3">
                                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recommendation</h4>
                                      <p className="mt-3 font-medium text-zinc-100">{workflow.recommendedAction}</p>
                                      <p className="mt-2 text-sm text-zinc-400">{workflow.reason}</p>
                                      <p className="mt-3 text-xs text-zinc-500">{formatSnooze(workflow.snoozedUntil)}</p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button type="button" className={actionButtonClass()} onClick={() => assignRecruiter(workflow)}>Assign recruiter</button>
                                        <button type="button" className={actionButtonClass()} onClick={() => assignDm(workflow)}>Assign DM</button>
                                        <button type="button" className={actionButtonClass("teal")} onClick={() => setStatus(workflow, "In Progress")}>In progress</button>
                                        <button type="button" className={actionButtonClass("teal")} onClick={() => setStatus(workflow, "Completed")}>Complete</button>
                                        <button type="button" className={actionButtonClass("amber")} onClick={() => snoozeWorkflow(workflow)}>Snooze</button>
                                        <button type="button" className={actionButtonClass("red")} onClick={() => escalateWorkflow(workflow)}>Escalate</button>
                                        <button type="button" className={actionButtonClass()} onClick={() => addNote(workflow)}>Add note</button>
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes</h4>
                                      {workflow.notes.length > 0 ? (
                                        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                                          {workflow.notes.slice(0, 5).map((note, index) => (
                                            <li key={`${workflow.id}-note-${index}`}>{note}</li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="mt-3 text-sm text-zinc-500">No notes yet.</p>
                                      )}
                                      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Escalation history</h4>
                                      {escalationHistory.length > 0 ? (
                                        <ol className="mt-3 space-y-2">
                                          {escalationHistory.map((event) => (
                                            <li key={event.id} className="border-l border-red-500/40 pl-3">
                                              <p className="text-sm text-zinc-300">{event.message}</p>
                                              <p className="mt-1 text-xs text-zinc-500">{formatDateTime(event.timestamp)}</p>
                                            </li>
                                          ))}
                                        </ol>
                                      ) : (
                                        <p className="mt-3 text-sm text-zinc-500">No escalations recorded.</p>
                                      )}
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Workflow history</h4>
                                      <ol className="mt-3 space-y-3">
                                        {workflow.activity.slice(0, 8).map((event) => (
                                          <li key={event.id} className="border-l border-zinc-700 pl-3">
                                            <p className="text-sm text-zinc-300">{event.message}</p>
                                            <p className="mt-1 text-xs text-zinc-500">{formatDateTime(event.timestamp)}</p>
                                          </li>
                                        ))}
                                      </ol>
                                    </div>
                                  </div>
                                ) : null}

                                {activeTab === "Forecast" ? (
                                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                                    {forecast ? (
                                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <div>
                                          <p className="text-xs uppercase tracking-wide text-zinc-500">Forecast risk</p>
                                          <p className="mt-1 text-2xl font-semibold text-teal-300">{forecast.forecastRiskScore}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-wide text-zinc-500">Urgency</p>
                                          <p className="mt-1 font-semibold text-zinc-100">{forecast.urgency}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-wide text-zinc-500">Projected applicant gap</p>
                                          <p className="mt-1 font-semibold tabular-nums text-zinc-100">{forecast.projectedApplicantShortage}</p>
                                        </div>
                                        <div>
                                          <p className="text-xs uppercase tracking-wide text-zinc-500">Projected rep shortage</p>
                                          <p className="mt-1 font-semibold tabular-nums text-zinc-100">{forecast.projectedRepShortage}</p>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-zinc-500">Forecast unavailable until Breezy candidates load.</p>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
