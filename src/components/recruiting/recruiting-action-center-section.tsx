"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import {
  buildOpportunityAutomationSnapshot,
  type AutomationPriorityLevel,
} from "@/lib/opportunity-automation";
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
import { useEffect, useMemo, useState } from "react";
import { KpiCards } from "./kpi-cards";

type RecruitingActionCenterSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

const STORAGE_KEY = "srs-dashboard:recruiting-action-center:v1";
const ALL = "__all__";

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

  useEffect(() => {
    setStateById(readStoredState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateById));
  }, [hydrated, stateById]);

  const snapshot = useMemo(() => {
    if (!recruiting.ok || !mel.ok) return null;
    return buildOpportunityAutomationSnapshot(recruiting.rows, recruiting.headers, mel.rows, mel.headers);
  }, [mel, recruiting]);

  const workflows = useMemo(
    () => mergeWorkflowState(snapshot?.rows ?? [], stateById),
    [snapshot, stateById],
  );

  const workloads = useMemo(() => buildRecruiterWorkload(workflows), [workflows]);

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
          <div className="grid gap-4 px-4 py-4 md:grid-cols-2 sm:px-5 xl:grid-cols-3">
            {filteredWorkflows.slice(0, 60).map((workflow) => (
              <article
                key={workflow.id}
                className={[
                  "rounded-xl border bg-zinc-950/40 p-4",
                  isWorkflowOverdue(workflow) ? "border-amber-500/35" : "border-zinc-800/80",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-50">{workflow.market}</h3>
                    <p className="mt-1 text-sm text-zinc-500">{workflow.recommendedAction}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_STYLES[workflow.workflowStatus],
                      ].join(" ")}
                    >
                      {workflow.workflowStatus}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        URGENCY_STYLES[workflow.suggestedPriorityLevel],
                      ].join(" ")}
                    >
                      {workflow.suggestedPriorityLevel}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-sm text-zinc-400">{workflow.reason}</p>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Recruiter</dt>
                    <dd className="mt-1 font-medium text-zinc-200">
                      {workflow.assignedRecruiter || "Unassigned"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">DM</dt>
                    <dd className="mt-1 font-medium text-zinc-200">{workflow.assignedDm}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Deadline</dt>
                    <dd className="mt-1 font-medium text-zinc-200">{workflow.deadline}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Score</dt>
                    <dd className="mt-1 font-medium tabular-nums text-teal-300">
                      {workflow.automationScore}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs text-zinc-500">{formatSnooze(workflow.snoozedUntil)}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={actionButtonClass()} onClick={() => assignRecruiter(workflow)}>
                    Assign recruiter
                  </button>
                  <button type="button" className={actionButtonClass()} onClick={() => assignDm(workflow)}>
                    Assign DM
                  </button>
                  <button type="button" className={actionButtonClass("teal")} onClick={() => setStatus(workflow, "In Progress")}>
                    In progress
                  </button>
                  <button type="button" className={actionButtonClass("teal")} onClick={() => setStatus(workflow, "Completed")}>
                    Complete
                  </button>
                  <button type="button" className={actionButtonClass("amber")} onClick={() => snoozeWorkflow(workflow)}>
                    Snooze
                  </button>
                  <button type="button" className={actionButtonClass("red")} onClick={() => escalateWorkflow(workflow)}>
                    Escalate
                  </button>
                  <button type="button" className={actionButtonClass()} onClick={() => addNote(workflow)}>
                    Add note
                  </button>
                </div>

                <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Activity timeline
                  </h4>
                  <ol className="mt-3 space-y-3">
                    {workflow.activity.slice(0, 4).map((event) => (
                      <li key={event.id} className="border-l border-zinc-700 pl-3">
                        <p className="text-sm text-zinc-300">{event.message}</p>
                        <p className="mt-1 text-xs text-zinc-500">{formatDateTime(event.timestamp)}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                {workflow.notes.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Notes</h4>
                    <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                      {workflow.notes.slice(0, 3).map((note, index) => (
                        <li key={`${workflow.id}-note-${index}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
