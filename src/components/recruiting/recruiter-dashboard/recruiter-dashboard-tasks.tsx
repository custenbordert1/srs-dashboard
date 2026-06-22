"use client";

import Link from "next/link";
import type { RecruiterTask } from "@/lib/hiring-funnel-automation/types";

const RISK_DOT: Record<RecruiterTask["risk"], string> = {
  critical: "bg-red-400",
  warning: "bg-amber-400",
  healthy: "bg-emerald-400",
};

type RecruiterAutoTasksPanelProps = {
  tasks: RecruiterTask[];
};

export function RecruiterAutoTasksPanel({ tasks }: RecruiterAutoTasksPanelProps) {
  if (tasks.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">Auto-generated tasks</h2>
      <p className="mt-1 text-sm text-zinc-500">Actionable tasks from funnel automation — open a candidate to complete.</p>
      <ul className="mt-4 space-y-2">
        {tasks.slice(0, 12).map((task) => (
          <li key={task.id}>
            <Link
              href={task.href}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5 text-sm hover:border-teal-500/30 hover:bg-teal-500/5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${RISK_DOT[task.risk]}`} aria-hidden />
                <span className="truncate text-zinc-100">
                  {task.label} — {task.candidateName}
                </span>
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{task.owner}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
