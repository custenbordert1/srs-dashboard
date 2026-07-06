"use client";

import { useState } from "react";
import { ExecutiveCard, ExecutiveButton, SectionHeader } from "@/components/executive/ui";
import { useControlledPaperworkAutomation } from "@/hooks/use-controlled-paperwork-automation";

export function PaperworkApprovalQueuePanel() {
  const { data, loading, refresh, refreshing, acting, submitApproval, error } =
    useControlledPaperworkAutomation();
  const queue = data?.approvalQueue ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelected = (candidateId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const toggleAll = () => {
    const actionable = queue.filter((row) => row.approveEnabled).map((row) => row.candidateId);
    if (selected.size === actionable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(actionable));
    }
  };

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Paperwork approval queue"
        subtitle="Approve or reject suggested actions. Nothing sends automatically."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExecutiveButton
              onClick={() => submitApproval({ action: "approve_selected", candidateIds: [...selected] })}
              disabled={acting || selected.size === 0}
            >
              Approve selected
            </ExecutiveButton>
            <ExecutiveButton
              onClick={() => submitApproval({ action: "approve_all" })}
              disabled={acting || queue.every((row) => !row.approveEnabled)}
            >
              Approve all
            </ExecutiveButton>
            <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </ExecutiveButton>
          </div>
        }
      />

      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Approval mode records recruiter decisions in the audit log. Paperwork and reminders are not sent
        unless explicit execution is enabled server-side. 24-hour communication cooldown is enforced.
      </p>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {loading && !data ? (
        <p className="mt-4 text-sm text-zinc-500">Loading paperwork approval queue…</p>
      ) : queue.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No outstanding paperwork candidates in the current cohort.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">
                  <input
                    type="checkbox"
                    aria-label="Select all actionable"
                    checked={selected.size > 0 && selected.size === queue.filter((r) => r.approveEnabled).length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Project</th>
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Paperwork status</th>
                <th className="pb-2 pr-3">Last contact</th>
                <th className="pb-2 pr-3">Suggested action</th>
                <th className="pb-2 pr-3">Reason</th>
                <th className="pb-2 pr-3">Confidence</th>
                <th className="pb-2 pr-3 text-center">Approve</th>
                <th className="pb-2 text-center">Reject</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.candidateName}`}
                      checked={selected.has(row.candidateId)}
                      disabled={!row.approveEnabled}
                      onChange={() => toggleSelected(row.candidateId)}
                    />
                  </td>
                  <td className="py-2 pr-3 font-medium text-zinc-100">{row.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-300">{row.project}</td>
                  <td className="py-2 pr-3 text-zinc-300">{row.recruiter}</td>
                  <td className="py-2 pr-3 text-zinc-300">{row.paperworkStatus}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">
                    {row.lastCommunication
                      ? new Date(row.lastCommunication).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-zinc-200">{row.recommendedAction}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-400 max-w-[220px]">{row.reason}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-200">{row.confidence}%</td>
                  <td className="py-2 pr-3 text-center">
                    <button
                      type="button"
                      disabled={!row.approveEnabled || acting || row.approvalStatus === "approved"}
                      onClick={() => submitApproval({ action: "approve", candidateIds: [row.candidateId] })}
                      className="rounded border border-emerald-700/60 px-2 py-0.5 text-xs text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {row.approvalStatus === "approved" ? "Approved" : "Approve"}
                    </button>
                  </td>
                  <td className="py-2 text-center">
                    <button
                      type="button"
                      disabled={!row.rejectEnabled || acting || row.approvalStatus === "rejected"}
                      onClick={() => submitApproval({ action: "reject", candidateIds: [row.candidateId] })}
                      className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {row.approvalStatus === "rejected" ? "Rejected" : "Reject"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ExecutiveCard>
  );
}
