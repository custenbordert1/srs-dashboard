"use client";

import type { QueueCandidateRow } from "@/lib/candidate-action-queue";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { CandidateAssignmentBadge } from "@/components/recruiting/candidate-assignment-badge";
import { ACTION_PRIORITY_STYLES } from "@/lib/recruiter-action-engine/action-sort";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import { slaToneClass } from "@/lib/candidate-action-sla";
import {
  computeRecruiterAgingBucket,
  RECRUITER_AGING_BUCKET_LABELS,
  type RecruiterAgingBucket,
} from "@/lib/recruiter-action-queue-filters";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

/** Fixed queue row height — list is not virtualized; stable for rapid scanning. */
export const QUEUE_ROW_HEIGHT_CLASS = "min-h-[4.25rem] max-h-[4.25rem]";

type CandidateQueueRowProps = {
  row: QueueCandidateRow;
  rosters: RecruiterRosters;
  actingRecruiter: string;
  rowIndex: number;
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

function queueAgingTone(bucket: RecruiterAgingBucket): string {
  if (bucket === "fresh") return "text-emerald-400/90";
  if (bucket === "24h") return "text-amber-300";
  if (bucket === "3d") return "text-amber-400";
  return "text-red-300";
}

function queueAgingDot(bucket: RecruiterAgingBucket): string {
  if (bucket === "fresh") return "bg-emerald-400/80";
  if (bucket === "24h") return "bg-amber-400/90";
  if (bucket === "3d") return "bg-amber-500/90";
  return "bg-red-400/90";
}

function rowUrgencyBorder(row: QueueCandidateRow, agingBucket: RecruiterAgingBucket): string {
  if (row.sla.followUpOverdue || row.sla.followUpDueSeverity === "critical") {
    return "border-l-red-500/60";
  }
  if (row.recruitingActions.needsFollowUp) {
    return "border-l-amber-500/50";
  }
  if (agingBucket === "3d" || agingBucket === "7d+") {
    return "border-l-amber-500/35";
  }
  return "border-l-transparent";
}

function QueueActionButton({
  label,
  onClick,
  disabled,
  tone = "neutral",
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "amber" | "teal" | "violet";
  title?: string;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-600/40 bg-amber-600/10 text-amber-100 hover:bg-amber-600/20"
      : tone === "teal"
        ? "border-teal-600/40 bg-teal-600/10 text-teal-100 hover:bg-teal-600/20"
        : tone === "violet"
          ? "border-violet-600/40 bg-violet-600/10 text-violet-100 hover:bg-violet-600/20"
          : "border-zinc-700/80 bg-zinc-950/80 text-zinc-300 hover:bg-zinc-800/80";
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex h-6 shrink-0 items-center justify-center rounded border px-2 text-[10px] font-medium leading-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500/50 ${toneClass}`}
    >
      {label}
    </button>
  );
}

function UrgencyRail({ row, agingBucket }: { row: QueueCandidateRow; agingBucket: RecruiterAgingBucket }) {
  const dueLabel = row.followUpDueAt
    ? `Due ${formatDueShort(row.followUpDueAt)}`
    : row.sla.followUpOverdue
      ? "Overdue"
      : null;

  return (
    <div className="flex w-[4.75rem] shrink-0 flex-col items-end justify-center gap-0.5 text-[10px] leading-none tabular-nums">
      <span className="font-semibold text-zinc-400">{row.aiGrade}</span>
      {agingBucket !== "fresh" ? (
        <span className={`inline-flex items-center gap-1 font-medium ${queueAgingTone(agingBucket)}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${queueAgingDot(agingBucket)}`} aria-hidden />
          {RECRUITER_AGING_BUCKET_LABELS[agingBucket]}
        </span>
      ) : (
        <span className="text-zinc-600">{RECRUITER_AGING_BUCKET_LABELS.fresh}</span>
      )}
      {dueLabel ? (
        <span
          className={[
            "max-w-full truncate font-medium",
            row.sla.followUpOverdue ? slaToneClass("critical") : slaToneClass("warn"),
          ].join(" ")}
          title={dueLabel}
        >
          {dueLabel}
        </span>
      ) : row.recruitingActions.priorityList ? (
        <span className="font-medium text-teal-300/90">Priority</span>
      ) : null}
    </div>
  );
}

export function CandidateQueueRow({
  row,
  rosters,
  actingRecruiter,
  rowIndex,
  onOpen,
  onAction,
  busy = false,
}: CandidateQueueRowProps) {
  const label = candidateLabel(row);
  const unassigned = isUnassignedRecruiter(row.assignedRecruiter);
  const agingBucket = computeRecruiterAgingBucket(row);
  const zebra = rowIndex % 2 === 0 ? "bg-zinc-950/25" : "bg-transparent";
  const ownedByYou = row.assignedRecruiter === actingRecruiter;
  const dmHint =
    row.dmNeedsAssignment && row.suggestedDM
      ? `Assign DM: ${row.suggestedDM}`
      : row.suggestedDM && row.suggestedDM !== "Unassigned"
        ? `DM ${row.suggestedDM}`
        : null;

  return (
    <li
      className={[
        "border-l-2",
        rowUrgencyBorder(row, agingBucket),
        zebra,
        "focus-within:bg-zinc-800/20",
      ].join(" ")}
    >
      <div
        className={`grid min-h-[5.5rem] max-h-[5.5rem] grid-cols-[minmax(0,1fr)_4.75rem] grid-rows-[auto_auto_auto] items-center gap-x-2 gap-y-0.5 px-3 py-1 sm:min-h-[4.25rem] sm:max-h-[4.25rem] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.75rem_minmax(0,auto)] sm:grid-rows-1 sm:gap-x-3 sm:gap-y-0 sm:px-4`}
      >
        <button
          type="button"
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen();
            }
          }}
          className="col-start-1 row-start-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500/50 sm:col-auto sm:row-auto"
          aria-label={`Open ${label}`}
        >
          <span className="block truncate text-sm font-semibold leading-tight text-zinc-50">{label}</span>
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-zinc-500">
            {row.positionName || "—"}
            <span className="text-zinc-700"> · </span>
            {row.workflowStatus}
            <span className="text-zinc-700"> · </span>
            <span className={ownedByYou ? "text-teal-400/90" : "text-zinc-500"}>
              {row.assignedRecruiter}
              {ownedByYou ? " (you)" : ""}
            </span>
            {row.recruiterAssignmentSource ? (
              <>
                <span className="text-zinc-700"> · </span>
                <CandidateAssignmentBadge
                  source={row.recruiterAssignmentSource}
                  reason={row.recruiterAssignmentReason}
                  confidence={row.recruiterAssignmentConfidence}
                  compact
                />
              </>
            ) : null}
            {dmHint ? (
              <>
                <span className="text-zinc-700"> · </span>
                <span className={row.dmNeedsAssignment ? "text-violet-300/90" : "text-zinc-600"}>
                  {dmHint}
                </span>
              </>
            ) : null}
          </span>
        </button>

        <div className="col-start-2 row-start-1 sm:col-auto sm:row-auto">
          <UrgencyRail row={row} agingBucket={agingBucket} />
        </div>

        <div
          className="col-span-2 row-start-2 flex min-h-[2rem] min-w-0 flex-col justify-center gap-1 rounded-md border border-teal-500/20 bg-teal-950/25 px-2 py-0.5 sm:col-span-1 sm:row-start-1 sm:min-h-[2.25rem] sm:py-1"
          title={row.actionReason ?? row.nextActionNeeded}
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-teal-50">{row.nextActionNeeded}</p>
            {row.actionPriority ? (
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTION_PRIORITY_STYLES[row.actionPriority]}`}
              >
                {row.actionPriority}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="col-span-2 row-start-3 flex h-7 min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:col-span-1 sm:row-start-1 sm:justify-end sm:pl-1 [&::-webkit-scrollbar]:hidden"
          role="toolbar"
          aria-label={`Actions for ${label}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <QueueActionButton
            label="Open"
            title="Open candidate drawer"
            onClick={onOpen}
          />
          <span className="h-4 w-px shrink-0 bg-zinc-700/80" aria-hidden />
          <QueueActionButton
            label="Assign"
            tone="teal"
            disabled={busy}
            title="Assign to acting recruiter"
            onClick={() => onAction({ action: "assign-recruiter", recruiter: actingRecruiter })}
          />
          {unassigned ? (
            <select
              disabled={busy}
              defaultValue=""
              aria-label={`Assign recruiter for ${label}`}
              title="Assign recruiter"
              className="h-6 max-w-[5.5rem] shrink-0 rounded border border-teal-600/40 bg-teal-950/40 px-1 text-[10px] text-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500/50"
              onChange={(e) => {
                const recruiter = e.target.value;
                if (!recruiter) return;
                onAction({ action: "assign-recruiter", recruiter });
                e.target.value = "";
              }}
            >
              <option value="">Recruiter…</option>
              {rosters.recruiters
                .filter((name) => !isUnassignedRecruiter(name))
                .map((recruiter) => (
                  <option key={recruiter} value={recruiter}>
                    {recruiter}
                  </option>
                ))}
            </select>
          ) : null}
          <QueueActionButton
            label="Follow-up"
            tone="amber"
            disabled={busy || row.recruitingActions.needsFollowUp}
            onClick={() => onAction({ action: "mark-follow-up" })}
          />
          <QueueActionButton
            label="Done"
            disabled={busy}
            onClick={() => onAction({ action: "complete-follow-up" })}
          />
          <QueueActionButton
            label="DM"
            tone="violet"
            disabled={busy || !row.dmNeedsAssignment}
            title="Apply suggested DM"
            onClick={() => onAction({ action: "apply-suggested-dm" })}
          />
          <select
            disabled={busy}
            defaultValue=""
            aria-label={`Assign DM for ${label}`}
            className="h-6 max-w-[5.5rem] shrink-0 rounded border border-zinc-700/80 bg-zinc-950/80 px-1 text-[10px] text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500/50"
            onChange={(e) => {
              const dm = e.target.value;
              if (!dm) return;
              onAction({ action: "assign-dm", dm });
              e.target.value = "";
            }}
          >
            <option value="">DM…</option>
            {rosters.dms.map((dm) => (
              <option key={dm} value={dm}>
                {dm}
              </option>
            ))}
          </select>
          <span className="h-4 w-px shrink-0 bg-zinc-700/80" aria-hidden />
          <QueueActionButton label="Snooze" disabled={busy} onClick={() => onAction({ action: "snooze-24h" })} />
          <QueueActionButton label="Paperwork" disabled={busy} onClick={() => onAction({ action: "move-paperwork" })} />
          <QueueActionButton
            label="MEL"
            tone="teal"
            disabled={busy}
            onClick={() => onAction({ action: "ready-mel" })}
          />
        </div>
      </div>
    </li>
  );
}
