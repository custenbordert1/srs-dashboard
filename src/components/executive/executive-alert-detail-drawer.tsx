"use client";

import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import { ACTION_LABELS } from "@/lib/alerts/executive-alert-labels";
import {
  EXECUTIVE_ALERT_STATUS_LABELS,
  FOLLOW_UP_PRIORITY_LABELS,
  type ExecutiveAlertActionLogEntry,
  type ExecutiveAlertFollowUp,
  type ExecutiveAlertStatus,
  type FollowUpOwnerKind,
  type FollowUpPriority,
} from "@/lib/alerts/executive-alert-status-types";
import { UI_BADGE, UI_BUTTON, UI_INPUT, UI_TYPE } from "@/lib/ui-tokens";
import { useEffect, useState } from "react";

const STATUS_STYLES: Record<ExecutiveAlertStatus, string> = {
  new: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  "in-review": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  snoozed: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

const ACTION_KIND_LABELS: Record<ExecutiveAlertActionLogEntry["kind"], string> = {
  "status-change": "Status change",
  note: "Note saved",
  "follow-up-assigned": "Follow-up assigned",
  reviewed: "Reviewed",
};

type ExecutiveAlertDetailDrawerProps = {
  open: boolean;
  alert: ExecutiveAlert | null;
  status: ExecutiveAlertStatus;
  note: string;
  actionLogs: ExecutiveAlertActionLogEntry[];
  followUp: ExecutiveAlertFollowUp | null;
  assigneeOptions: ExecutiveAlertAssigneeOptions;
  onClose: () => void;
  onStatusChange: (status: ExecutiveAlertStatus) => void;
  onSaveNote: (note: string) => void;
  onAssignFollowUp: (input: {
    ownerKind: FollowUpOwnerKind;
    ownerName: string;
    dueDate: string;
    priority: FollowUpPriority;
    notes?: string;
  }) => void;
  onNavigate: (alert: ExecutiveAlert) => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-100">{value}</span>
    </div>
  );
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

export function ExecutiveAlertDetailDrawer({
  open,
  alert,
  status,
  note,
  actionLogs,
  followUp,
  assigneeOptions,
  onClose,
  onStatusChange,
  onSaveNote,
  onAssignFollowUp,
  onNavigate,
}: ExecutiveAlertDetailDrawerProps) {
  const [noteDraft, setNoteDraft] = useState(note);
  const [ownerKind, setOwnerKind] = useState<FollowUpOwnerKind>("dm");
  const [ownerName, setOwnerName] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [priority, setPriority] = useState<FollowUpPriority>("high");
  const [followUpNotes, setFollowUpNotes] = useState("");

  useEffect(() => {
    setNoteDraft(note);
  }, [note, alert?.id]);

  useEffect(() => {
    if (!followUp) return;
    setOwnerKind(followUp.ownerKind);
    setOwnerName(followUp.ownerName);
    setDueDate(followUp.dueDate.slice(0, 10));
    setPriority(followUp.priority);
    setFollowUpNotes(followUp.notes ?? "");
  }, [followUp]);

  useEffect(() => {
    if (!alert || followUp || ownerName) return;
    const suggested =
      ownerKind === "dm"
        ? alert.context?.dmName ?? assigneeOptions.dms[0] ?? ""
        : alert.context?.linkedCandidates?.[0]?.assignedRecruiter ??
          assigneeOptions.recruiters[0] ??
          "";
    setOwnerName(suggested);
  }, [alert, assigneeOptions, followUp, ownerKind, ownerName]);

  if (!open || !alert) return null;

  const context = alert.context;
  const ownerOptions = ownerKind === "dm" ? assigneeOptions.dms : assigneeOptions.recruiters;

  return (
    <>
      <button
        type="button"
        aria-label="Close alert drawer"
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.critical}`}>
                {alert.severity}
              </span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[status]}`}>
                {EXECUTIVE_ALERT_STATUS_LABELS[status]}
              </span>
              <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                {alert.category}
              </span>
            </div>
            <h2 className={UI_TYPE.sectionTitle}>{alert.title}</h2>
            <p className="text-sm text-zinc-400">{alert.description}</p>
          </div>
          <button type="button" className={UI_BUTTON.ghost} onClick={onClose}>
            Close
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Why critical</h3>
            <p className="text-sm text-zinc-200">{alert.reason}</p>
            <p className="text-xs text-zinc-500">Impact score {alert.impactScore}</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Store / project</h3>
            <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <DetailRow label="Store" value={context?.storeName ?? "—"} />
              <DetailRow label="Project" value={context?.projectName ?? alert.title} />
              <DetailRow label="Client" value={context?.client ?? "—"} />
              <DetailRow
                label="Location"
                value={
                  context?.city && context?.state
                    ? `${context.city}, ${context.state}`
                    : context?.state ?? "—"
                }
              />
              <DetailRow label="DM / Territory" value={context?.dmName ?? context?.territoryLabel ?? "—"} />
              {context?.coveragePercent != null ? (
                <DetailRow label="Coverage" value={`${context.coveragePercent}%`} />
              ) : null}
              {context?.openCalls != null ? (
                <DetailRow label="Open calls" value={String(context.openCalls)} />
              ) : null}
              {context?.candidatesInPipeline != null ? (
                <DetailRow label="Pipeline candidates" value={String(context.candidatesInPipeline)} />
              ) : null}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommended action</h3>
            <p className="text-sm font-medium text-teal-100">{ACTION_LABELS[alert.recommendedAction]}</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notes</h3>
            <textarea
              className="min-h-24 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add operational notes for this alert…"
            />
            <button type="button" className={UI_BUTTON.secondary} onClick={() => onSaveNote(noteDraft)}>
              Save note
            </button>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assign follow-up</h3>
            <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <div className="flex flex-wrap gap-2">
                {(["dm", "recruiter"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={ownerKind === kind ? UI_BUTTON.primary : UI_BUTTON.secondary}
                    onClick={() => {
                      setOwnerKind(kind);
                      setOwnerName("");
                    }}
                  >
                    {kind === "dm" ? "DM" : "Recruiter"}
                  </button>
                ))}
              </div>
              <select
                className={`${UI_INPUT.select} w-full`}
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
              >
                <option value="">Select {ownerKind === "dm" ? "DM" : "recruiter"}</option>
                {ownerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs text-zinc-500">
                  Due date
                  <input
                    type="date"
                    className={`${UI_INPUT.select} w-full`}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-xs text-zinc-500">
                  Priority
                  <select
                    className={`${UI_INPUT.select} w-full`}
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as FollowUpPriority)}
                  >
                    {(Object.keys(FOLLOW_UP_PRIORITY_LABELS) as FollowUpPriority[]).map((value) => (
                      <option key={value} value={value}>
                        {FOLLOW_UP_PRIORITY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <textarea
                className="min-h-16 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                value={followUpNotes}
                onChange={(event) => setFollowUpNotes(event.target.value)}
                placeholder="Follow-up instructions (optional)"
              />
              <button
                type="button"
                className={UI_BUTTON.primary}
                disabled={!ownerName || !dueDate}
                onClick={() =>
                  onAssignFollowUp({
                    ownerKind,
                    ownerName,
                    dueDate,
                    priority,
                    notes: followUpNotes,
                  })
                }
              >
                {followUp ? "Update follow-up" : "Assign follow-up"}
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Action log</h3>
            {actionLogs.length === 0 ? (
              <p className="text-sm text-zinc-500">No actions recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {actionLogs.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-zinc-100">{ACTION_KIND_LABELS[entry.kind]}</span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">Reviewed by {entry.reviewedBy}</p>
                    {entry.status ? (
                      <p className="text-xs text-zinc-500">
                        Status · {entry.previousStatus ? `${entry.previousStatus} → ` : ""}
                        {entry.status}
                      </p>
                    ) : null}
                    {entry.note ? <p className="mt-1 text-xs text-zinc-300">{entry.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {context?.linkedCandidates && context.linkedCandidates.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Linked candidates</h3>
              <ul className="space-y-2">
                {context.linkedCandidates.map((candidate) => (
                  <li
                    key={candidate.candidateId}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-zinc-100">{candidate.name}</p>
                    <p className="text-xs text-zinc-500">{candidate.positionName}</p>
                    <p className="text-xs text-zinc-400">
                      {candidate.workflowStatus} · {candidate.assignedRecruiter}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {context?.dataSources && context.dataSources.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Data sources</h3>
              <div className="flex flex-wrap gap-2">
                {context.dataSources.map((source) => (
                  <span
                    key={source}
                    className="rounded border border-zinc-700/80 bg-zinc-900/60 px-2 py-1 text-[10px] text-zinc-300"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="space-y-3 border-t border-zinc-800 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {(["new", "in-review", "snoozed", "resolved"] as const).map((nextStatus) => (
              <button
                key={nextStatus}
                type="button"
                className={status === nextStatus ? UI_BUTTON.primary : UI_BUTTON.secondary}
                onClick={() => onStatusChange(nextStatus)}
              >
                {EXECUTIVE_ALERT_STATUS_LABELS[nextStatus]}
              </button>
            ))}
          </div>
          <button type="button" className={`${UI_BUTTON.primary} w-full`} onClick={() => onNavigate(alert)}>
            Go to {alert.destination.label}
          </button>
        </footer>
      </aside>
    </>
  );
}
