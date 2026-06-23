"use client";

import type { RecruiterAssignmentSource } from "@/lib/candidate-workflow-types";

type CandidateAssignmentBadgeProps = {
  source?: RecruiterAssignmentSource | null;
  reason?: string | null;
  confidence?: number | null;
  compact?: boolean;
};

export function CandidateAssignmentBadge({
  source,
  reason,
  confidence,
  compact = false,
}: CandidateAssignmentBadgeProps) {
  if (!source) return null;

  const label = source === "auto" ? "Auto assigned" : "Manual assigned";
  const tone =
    source === "auto"
      ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-100"
      : "border-zinc-600 bg-zinc-900 text-zinc-300";

  if (compact) {
    return (
      <span
        className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
        title={reason ?? undefined}
      >
        {label}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest">{label}</p>
      {reason ? <p className="mt-1 text-xs text-zinc-300">{reason}</p> : null}
      {typeof confidence === "number" ? (
        <p className="mt-1 text-[11px] tabular-nums text-zinc-400">Confidence {confidence}%</p>
      ) : null}
    </div>
  );
}
