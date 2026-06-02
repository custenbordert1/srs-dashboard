"use client";

import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

type CandidateTableQuickActionsProps = {
  candidateId: string;
  suggestedDM: string;
  dmNeedsAssignment: boolean;
  rosters: RecruiterRosters;
  busy?: boolean;
  onAction: (candidateId: string, payload: CandidateQueueActionPayload) => void;
};

function QuickActionButton({
  label,
  onClick,
  disabled,
  title,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: "neutral" | "teal" | "violet" | "amber";
}) {
  const toneClass =
    tone === "teal"
      ? "border-teal-600/40 bg-teal-600/10 text-teal-100 hover:bg-teal-600/20"
      : tone === "violet"
        ? "border-violet-600/40 bg-violet-600/10 text-violet-100 hover:bg-violet-600/20"
        : tone === "amber"
          ? "border-amber-600/40 bg-amber-600/10 text-amber-100 hover:bg-amber-600/20"
          : "border-zinc-700/80 bg-zinc-950/80 text-zinc-300 hover:bg-zinc-800/80";
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex h-5 shrink-0 items-center justify-center rounded border px-1.5 text-[9px] font-medium leading-none disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {label}
    </button>
  );
}

export function CandidateTableQuickActions({
  candidateId,
  suggestedDM,
  dmNeedsAssignment,
  rosters,
  busy = false,
  onAction,
}: CandidateTableQuickActionsProps) {
  return (
    <div className="mt-1 flex max-w-full flex-wrap items-center gap-0.5">
      {dmNeedsAssignment && suggestedDM && suggestedDM !== "Unassigned" ? (
        <QuickActionButton
          label={busy ? "…" : "Assign DM"}
          tone="violet"
          disabled={busy}
          title={`Assign suggested DM: ${suggestedDM}`}
          onClick={() => onAction(candidateId, { action: "apply-suggested-dm" })}
        />
      ) : null}
      <select
        disabled={busy}
        defaultValue=""
        aria-label="Assign DM"
        className="h-5 max-w-[4.5rem] shrink-0 rounded border border-zinc-700/80 bg-zinc-950/80 px-0.5 text-[9px] text-zinc-300"
        onChange={(event) => {
          const dm = event.target.value;
          if (!dm) return;
          onAction(candidateId, { action: "assign-dm", dm });
          event.target.value = "";
        }}
      >
        <option value="">DM…</option>
        {rosters.dms.map((dm) => (
          <option key={dm} value={dm}>
            {dm.split(" ")[0]}
          </option>
        ))}
      </select>
      <QuickActionButton
        label="Paperwork"
        tone="amber"
        disabled={busy}
        onClick={() => onAction(candidateId, { action: "move-paperwork" })}
      />
      <QuickActionButton
        label="Snooze 24h"
        disabled={busy}
        onClick={() => onAction(candidateId, { action: "snooze-24h" })}
      />
      <QuickActionButton
        label="Ready MEL"
        tone="teal"
        disabled={busy}
        onClick={() => onAction(candidateId, { action: "ready-mel" })}
      />
    </div>
  );
}
