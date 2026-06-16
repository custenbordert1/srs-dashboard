"use client";

import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import {
  buildExecutiveAlertFollowUpQueue,
  followUpOwnerLabel,
  followUpPriorityLabel,
  formatFollowUpDueLabel,
  type ExecutiveAlertFollowUpQueueItem,
} from "@/lib/alerts/executive-alert-follow-up-queue";
import {
  EXECUTIVE_ALERT_STATUS_LABELS,
  type ExecutiveAlertActionLogEntry,
  type ExecutiveAlertFollowUp,
  type ExecutiveAlertStatus,
  type FollowUpOwnerKind,
  type FollowUpPriority,
} from "@/lib/alerts/executive-alert-status-types";
import { UI_BADGE, UI_BUTTON, UI_SURFACE, UI_TYPE } from "@/lib/ui-tokens";

type ExecutiveAlertFollowUpQueueProps = {
  queue: ExecutiveAlertFollowUpQueueItem[];
  onOpenAlert: (alertId: string) => void;
};

export function ExecutiveAlertFollowUpQueue({ queue, onOpenAlert }: ExecutiveAlertFollowUpQueueProps) {
  if (queue.length === 0) {
    return (
      <div className={`${UI_SURFACE.panel} p-6 text-center`}>
        <p className={UI_TYPE.sectionTitle}>No follow-ups assigned</p>
        <p className="mt-1 text-sm text-zinc-500">
          Assign follow-ups from an alert drawer to track DM and recruiter accountability.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-800/80 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Alert / Store</th>
            <th className="px-4 py-3">Owner</th>
            <th className="px-4 py-3">Due date</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {queue.map((row) => (
            <tr
              key={row.followUp.id}
              className={row.isOverdue ? "bg-red-500/10" : "bg-zinc-950/30"}
            >
              <td className="px-4 py-3">
                <p className="font-medium text-zinc-100">{row.storeLabel}</p>
                <p className="text-xs text-zinc-500">{row.alert.title}</p>
              </td>
              <td className="px-4 py-3 text-zinc-300">{followUpOwnerLabel(row.followUp)}</td>
              <td className={`px-4 py-3 ${row.isOverdue ? "font-semibold text-red-200" : "text-zinc-300"}`}>
                {formatFollowUpDueLabel(row.followUp.dueDate, row.isOverdue)}
              </td>
              <td className="px-4 py-3 text-zinc-300">{followUpPriorityLabel(row.followUp.priority)}</td>
              <td className="px-4 py-3">
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.neutral}`}>
                  {EXECUTIVE_ALERT_STATUS_LABELS[row.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  className={UI_BUTTON.secondary}
                  onClick={() => onOpenAlert(row.alert.id)}
                >
                  Open alert
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}