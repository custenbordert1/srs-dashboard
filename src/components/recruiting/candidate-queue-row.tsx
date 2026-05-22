"use client";

import type { QueueCandidateRow } from "@/lib/candidate-action-queue";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import { slaToneClass } from "@/lib/candidate-action-sla";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

type CandidateQueueRowProps = {
  row: QueueCandidateRow;
  rosters: RecruiterRosters;
  actingRecruiter: string;
  onOpen: () => void;
  onAction: (payload: CandidateQueueActionPayload) => void;
  busy?: boolean;
};

function candidateLabel(row: QueueCandidateRow): string {
  const name = `${row.firstName} ${row.lastName}`.trim();
  return name || row.email || row.candidateId;
}

function formatDueShort(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export function CandidateQueueRow({
  row,
  rosters,
  actingRecruiter,
  onOpen,
  onAction,
  busy = false,
}: CandidateQueueRowProps) {
  const overdue = row.sla.followUpOverdue || row.sla.followUpDueSeverity === "critical";

  return (
    <li className={overdue ? "border-l-2 border-l-red-500/50" : "border-l-2 border-l-transparent"}>
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full flex-col gap-1 text-left transition-colors hover:opacity-90 sm:flex-row sm:items-start sm:justify-between"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-zinc-100">{candidateLabel(row)}</span>
            <span className="block truncate text-xs text-zinc-500">
              {row.positionName} · {row.workflowStatus} · {row.assignedRecruiter}
              {row.assignedRecruiter === actingRecruiter ? " (you)" : ""}
            </span>
            {row.dmNeedsAssignment ? (
              <span className="mt-1 inline-flex rounded-full border border-violet-500/35 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-100">
                Suggested DM: {row.suggestedDM}
              </span>
            ) : row.suggestedDM && row.suggestedDM !== "Unassigned" ? (
              <span className="mt-1 inline-flex rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-400">
                Territory DM: {row.suggestedDM}
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-semibold text-teal-200">{row.aiGrade}</span>
            <span className="text-zinc-500">P{row.priorityScore}</span>
            {row.followUpDueAt ? (
              <span
                className={[
                  "rounded-full border px-2 py-0.5",
                  row.sla.followUpOverdue ? slaToneClass("critical") : slaToneClass("warn"),
                ].join(" ")}
              >
                Due {formatDueShort(row.followUpDueAt)}
              </span>
            ) : row.sla.followUpOverdue ? (
              <span className={`rounded-full border px-2 py-0.5 ${slaToneClass("critical")}`}>Follow-up overdue</span>
            ) : null}
          </span>
        </button>

        <div
          className="flex flex-wrap gap-1"
          role="toolbar"
          aria-label={`Actions for ${candidateLabel(row)}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={busy}
            className="rounded border border-zinc-700 bg-zinc-950/80 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => onAction({ action: "assign-recruiter", recruiter: actingRecruiter })}
          >
            Assign me
          </button>
          <button
            type="button"
            disabled={busy || !row.dmNeedsAssignment}
            className="rounded border border-violet-600/40 bg-violet-600/10 px-2 py-0.5 text-[10px] text-violet-100 hover:bg-violet-600/20 disabled:opacity-50"
            onClick={() => onAction({ action: "apply-suggested-dm" })}
          >
            Apply DM
          </button>
          <select
            disabled={busy}
            defaultValue=""
            className="max-w-[7rem] rounded border border-zinc-700 bg-zinc-950/80 px-1 py-0.5 text-[10px] text-zinc-300"
            onChange={(e) => {
              const dm = e.target.value;
              if (!dm) return;
              onAction({ action: "assign-dm", dm });
              e.target.value = "";
            }}
          >
            <option value="">Assign DM…</option>
            {rosters.dms.map((dm) => (
              <option key={dm} value={dm}>
                {dm}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => onAction({ action: "complete-follow-up" })}
          >
            Follow-up done
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => onAction({ action: "snooze-24h" })}
          >
            Snooze 24h
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => onAction({ action: "move-paperwork" })}
          >
            Paperwork
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded border border-teal-600/40 bg-teal-600/10 px-2 py-0.5 text-[10px] text-teal-100 hover:bg-teal-600/20 disabled:opacity-50"
            onClick={() => onAction({ action: "ready-mel" })}
          >
            Ready for MEL
          </button>
        </div>
      </div>
    </li>
  );
}
