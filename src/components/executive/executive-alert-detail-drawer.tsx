"use client";

import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import {
  EXECUTIVE_ALERT_STATUS_LABELS,
  type ExecutiveAlertStatus,
} from "@/lib/alerts/executive-alert-status-types";
import { ACTION_LABELS } from "@/lib/alerts/executive-alert-labels";
import { UI_BADGE, UI_BUTTON, UI_TYPE } from "@/lib/ui-tokens";

const STATUS_STYLES: Record<ExecutiveAlertStatus, string> = {
  new: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  "in-review": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  snoozed: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

type ExecutiveAlertDetailDrawerProps = {
  open: boolean;
  alert: ExecutiveAlert | null;
  status: ExecutiveAlertStatus;
  onClose: () => void;
  onStatusChange: (status: ExecutiveAlertStatus) => void;
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

export function ExecutiveAlertDetailDrawer({
  open,
  alert,
  status,
  onClose,
  onStatusChange,
  onNavigate,
}: ExecutiveAlertDetailDrawerProps) {
  if (!open || !alert) return null;

  const context = alert.context;

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
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-2">
              <DetailRow label="Store" value={context?.storeName ?? "—"} />
              <DetailRow label="Project" value={context?.projectName ?? alert.title} />
              <DetailRow label="Client" value={context?.client ?? "—"} />
              <DetailRow label="Location" value={
                context?.city && context?.state
                  ? `${context.city}, ${context.state}`
                  : context?.state ?? "—"
              } />
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
            <p className="text-xs text-zinc-500">
              Automation ready · {alert.automationKind} · manual only
            </p>
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

          {context?.linkedReps && context.linkedReps.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Linked reps</h3>
              <ul className="space-y-2">
                {context.linkedReps.map((rep) => (
                  <li
                    key={`${rep.name}-${rep.state}`}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-zinc-100">{rep.name}</p>
                    <p className="text-xs text-zinc-400">
                      {rep.state || "—"} · {rep.active ? "Active" : "Inactive"}
                      {rep.distanceMiles != null ? ` · ${rep.distanceMiles} mi` : ""}
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
