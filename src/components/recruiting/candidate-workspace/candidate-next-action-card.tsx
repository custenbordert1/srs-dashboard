"use client";

import type { WorkspaceAction } from "@/lib/candidate-workspace";

const TONE_CLASS: Record<WorkspaceAction["tone"], string> = {
  teal: "border-teal-500/40 bg-teal-500/15 text-teal-100 hover:bg-teal-500/25",
  amber: "border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25",
  sky: "border-sky-500/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25",
  cyan: "border-cyan-500/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25",
  neutral: "border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800",
};

type CandidateNextActionCardProps = {
  action: WorkspaceAction;
  busy?: boolean;
  onPrimary: () => void;
  onComplete: () => void;
};

export function CandidateNextActionCard({
  action,
  busy,
  onPrimary,
  onComplete,
}: CandidateNextActionCardProps) {
  return (
    <section className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-zinc-900/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-200/90">Next action</p>
      <h3 className="mt-1 text-xl font-semibold text-zinc-50">{action.label}</h3>
      <p className="mt-2 text-sm text-zinc-400">{action.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={action.disabled || busy}
          onClick={onPrimary}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-40 ${TONE_CLASS[action.tone]}`}
        >
          {busy ? "Working…" : action.label}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onComplete}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
        >
          {action.completeLabel}
        </button>
      </div>
    </section>
  );
}
