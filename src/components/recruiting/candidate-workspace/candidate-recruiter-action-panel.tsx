"use client";

import {
  ACTION_PRIORITY_STYLES,
  formatActionDueLabel,
} from "@/lib/recruiter-action-engine/action-sort";
import type {
  RecruiterActionPriority,
} from "@/lib/recruiter-action-engine/types";

type CandidateRecruiterActionPanelProps = {
  requiredAction?: string | null;
  actionPriority?: RecruiterActionPriority | null;
  actionReason?: string | null;
  actionDueDate?: string | null;
  actionConfidence?: number | null;
};

export function CandidateRecruiterActionPanel({
  requiredAction,
  actionPriority,
  actionReason,
  actionDueDate,
  actionConfidence,
}: CandidateRecruiterActionPanelProps) {
  if (!requiredAction?.trim()) return null;

  const priority = actionPriority ?? "medium";
  const tone = ACTION_PRIORITY_STYLES[priority];

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Recruiter Action Engine
      </p>
      <div className={`mt-3 rounded-lg border px-3 py-3 ${tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Recommended Action</p>
            <p className="mt-1 text-base font-semibold">{requiredAction}</p>
          </div>
          <span className="rounded-md border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {priority} priority
          </span>
        </div>
        {actionReason ? <p className="mt-2 text-sm text-zinc-300">{actionReason}</p> : null}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
          <span>
            Due: <span className="font-medium text-zinc-200">{formatActionDueLabel(actionDueDate)}</span>
          </span>
          {typeof actionConfidence === "number" ? (
            <span>
              Confidence: <span className="font-medium text-zinc-200">{actionConfidence}%</span>
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
