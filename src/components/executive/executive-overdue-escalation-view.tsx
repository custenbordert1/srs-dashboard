"use client";

import type { OverdueEscalationDashboard } from "@/lib/executive-accountability/overdue-escalation";

const BUCKET_LABELS = ["21+", "14+", "7+", "3+"] as const;

type ExecutiveOverdueEscalationViewProps = {
  dashboard: OverdueEscalationDashboard;
};

export function ExecutiveOverdueEscalationView({ dashboard }: ExecutiveOverdueEscalationViewProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        {dashboard.totalOverdue} overdue action{dashboard.totalOverdue === 1 ? "" : "s"} in escalation
        buckets (3+ days past due).
      </p>

      {BUCKET_LABELS.map((bucket) => {
        const rows = dashboard.buckets[bucket];
        if (rows.length === 0) return null;
        return (
          <section key={bucket} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <h3 className="text-sm font-semibold text-red-100">{bucket} days overdue</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-red-500/20 text-xs uppercase text-zinc-500">
                    <th className="pb-2 pr-3">Action</th>
                    <th className="pb-2 pr-3">Owner</th>
                    <th className="pb-2 pr-3">Priority</th>
                    <th className="pb-2 pr-3">Due</th>
                    <th className="pb-2">Days overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.action.recommendationId} className="border-b border-red-500/10">
                      <td className="py-2 pr-3 text-zinc-200">{row.action.title}</td>
                      <td className="py-2 pr-3 text-zinc-400">{row.owner}</td>
                      <td className="py-2 pr-3 text-zinc-400">{row.action.priority}</td>
                      <td className="py-2 pr-3 text-zinc-400">
                        {new Date(row.action.dueDate).toLocaleDateString()}
                      </td>
                      <td className="py-2 tabular-nums text-red-200">{row.daysOverdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {dashboard.totalOverdue === 0 ? (
        <p className="text-sm text-emerald-200/90">No overdue actions in escalation buckets.</p>
      ) : null}
    </div>
  );
}
