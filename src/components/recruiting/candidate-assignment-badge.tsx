"use client";

import type { RecruiterAssignmentSource } from "@/lib/candidate-workflow-types";

type CandidateAssignmentBadgeProps = {
  source?: RecruiterAssignmentSource | null;
  reason?: string | null;
  confidence?: number | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  confirmationStatus?: string | null;
  compact?: boolean;
};

function sourceLabel(source: RecruiterAssignmentSource): string {
  if (source === "manual" || source === "operator_restore" || source === "operator_confirmed_historical_restore") {
    return "Operator";
  }
  if (source === "auto" || source === "territory_default") return "Auto assigned";
  if (source === "breezy_import") return "Breezy";
  if (source === "production_assignment" || source === "internal_assignment") {
    return "Approved auto";
  }
  return "Assigned";
}

function formatAssignedAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

export function CandidateAssignmentBadge({
  source,
  reason,
  confidence,
  assignedAt,
  assignedBy,
  confirmationStatus,
  compact = false,
}: CandidateAssignmentBadgeProps) {
  if (!source) return null;

  const label = sourceLabel(source);
  const isOperator =
    source === "manual" ||
    source === "operator_restore" ||
    source === "operator_confirmed_historical_restore";
  const tone = isOperator
    ? "border-teal-500/35 bg-teal-500/10 text-teal-100"
    : source === "auto" || source === "territory_default"
      ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-100"
      : "border-zinc-600 bg-zinc-900 text-zinc-300";

  const when = formatAssignedAt(assignedAt);
  const titleParts = [
    reason,
    when ? `Assigned ${when}` : null,
    assignedBy ? `by ${assignedBy}` : null,
    confirmationStatus ? `status: ${confirmationStatus}` : null,
  ].filter(Boolean);

  if (compact) {
    return (
      <span
        className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
        title={titleParts.join(" · ") || undefined}
      >
        {label}
        {when ? ` · ${when}` : ""}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest">{label} source</p>
      {when ? <p className="mt-1 text-xs text-zinc-300">{when}</p> : null}
      {assignedBy ? <p className="mt-0.5 text-xs text-zinc-400">by {assignedBy}</p> : null}
      {reason ? <p className="mt-1 text-xs text-zinc-300">{reason}</p> : null}
      {typeof confidence === "number" ? (
        <p className="mt-1 text-[11px] tabular-nums text-zinc-400">Confidence {confidence}%</p>
      ) : null}
    </div>
  );
}
