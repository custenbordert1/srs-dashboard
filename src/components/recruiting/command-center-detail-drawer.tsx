"use client";

import type { ExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import { ACTION_LABELS } from "@/lib/alerts/executive-alert-labels";
import {
  EXECUTIVE_ALERT_STATUS_LABELS,
  FOLLOW_UP_PRIORITY_LABELS,
  type ExecutiveAlertStatus,
} from "@/lib/alerts/executive-alert-status-types";
import type {
  CommandCenterDrawerContext,
  CommandCenterWorkQueueItem,
} from "@/lib/unified-recruiting-command-center";
import { UI_BADGE, UI_BUTTON, UI_TYPE } from "@/lib/ui-tokens";

const STATUS_STYLES: Record<ExecutiveAlertStatus, string> = {
  new: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  "in-review": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  snoozed: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

const TYPE_LABELS: Record<CommandCenterWorkQueueItem["type"], string> = {
  alert: "Alert",
  recommendation: "Recommendation",
  "follow-up": "Follow-up",
  "daily-action": "Daily action",
};

type CommandCenterDetailDrawerProps = {
  open: boolean;
  context: CommandCenterDrawerContext | null;
  onClose: () => void;
  onStatusChange?: (alertId: string, status: ExecutiveAlertStatus) => void;
  onNavigate?: () => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-100">{value}</span>
    </div>
  );
}

export function CommandCenterDetailDrawer({
  open,
  context,
  onClose,
  onStatusChange,
  onNavigate,
}: CommandCenterDetailDrawerProps) {
  if (!open || !context) return null;

  const alertId = context.alert?.id ?? context.dailyAction?.alertId;

  return (
    <>
      <button
        type="button"
        aria-label="Close command center drawer"
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.critical}`}>
                {FOLLOW_UP_PRIORITY_LABELS[context.priority]}
              </span>
              <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                {TYPE_LABELS[context.type]}
              </span>
              {typeof context.status === "string" && context.status in EXECUTIVE_ALERT_STATUS_LABELS ? (
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[context.status as ExecutiveAlertStatus]}`}
                >
                  {EXECUTIVE_ALERT_STATUS_LABELS[context.status as ExecutiveAlertStatus]}
                </span>
              ) : (
                <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                  {String(context.status)}
                </span>
              )}
            </div>
            <h2 className={UI_TYPE.sectionTitle}>{context.title}</h2>
            <p className="text-sm text-zinc-400">{context.impactLabel}</p>
          </div>
          <button type="button" className={UI_BUTTON.ghost} onClick={onClose}>
            Close
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommended next action</h3>
            <p className="text-sm font-medium text-teal-100">{context.recommendedNextAction}</p>
            {onNavigate ? (
              <button type="button" className={UI_BUTTON.primary} onClick={onNavigate}>
                Open destination
              </button>
            ) : null}
          </section>

          {context.riskDetail ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Risk details</h3>
              <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
                <DetailRow label="Risk score" value={String(context.riskDetail.riskScore)} />
                <DetailRow label="Risk level" value={context.riskDetail.riskLevel} />
                <DetailRow label="Trend" value={context.riskDetail.trend} />
                {context.riskDetail.factors.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-300">
                    {context.riskDetail.factors.map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                ) : null}
                {context.riskDetail.recommendations.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-teal-200/90">
                    {context.riskDetail.recommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ) : null}

          {context.recommendation ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommendation details</h3>
              <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-sm text-zinc-200">
                <p className="font-medium text-zinc-50">{context.recommendation.title}</p>
                <p>{context.recommendation.reasoning}</p>
                <DetailRow
                  label="ROI score"
                  value={String(context.recommendation.opportunity.expectedRoiScore)}
                />
              </div>
            </section>
          ) : null}

          {context.alert ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Alert context</h3>
              <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
                <p className="text-sm text-zinc-200">{context.alert.description}</p>
                <DetailRow
                  label="Recommended action"
                  value={ACTION_LABELS[context.alert.recommendedAction]}
                />
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Linked entities</h3>
            <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
              <DetailRow label="Territory" value={context.territory} />
              <DetailRow label="Owner" value={context.owner} />
              <DetailRow label="Stores" value={context.linkedStores.join(", ") || "—"} />
              <DetailRow label="Projects" value={context.linkedProjects.join(", ") || "—"} />
            </div>
          </section>

          {context.linkedCandidates.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Linked candidates</h3>
              <ul className="space-y-2">
                {context.linkedCandidates.map((candidate) => (
                  <li
                    key={candidate.candidateId}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-zinc-50">{candidate.name}</p>
                    <p className="text-xs text-zinc-400">
                      {candidate.workflowStatus} · {candidate.assignedRecruiter}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {context.followUpHistory.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Follow-up history</h3>
              <ul className="space-y-2">
                {context.followUpHistory.map((followUp) => (
                  <li
                    key={followUp.id}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-200"
                  >
                    <p className="font-medium text-zinc-50">
                      {followUp.ownerName} · {FOLLOW_UP_PRIORITY_LABELS[followUp.priority]}
                    </p>
                    <p className="text-xs text-zinc-400">
                      Due {new Date(followUp.dueDate).toLocaleDateString()}
                      {followUp.completedAt ? " · Completed" : ""}
                    </p>
                    {followUp.notes ? <p className="mt-1 text-xs text-zinc-500">{followUp.notes}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {alertId && onStatusChange ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Update status</h3>
              <div className="flex flex-wrap gap-2">
                {(["in-review", "snoozed", "resolved"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={UI_BUTTON.secondary}
                    onClick={() => onStatusChange(alertId, status)}
                  >
                    {EXECUTIVE_ALERT_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export type { ExecutiveAlertAssigneeOptions };
