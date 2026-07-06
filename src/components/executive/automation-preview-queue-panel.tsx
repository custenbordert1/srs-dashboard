"use client";

import { ExecutiveCard, ExecutiveButton, SectionHeader } from "@/components/executive/ui";
import { useCandidateAdvancementIntelligence } from "@/hooks/use-candidate-advancement-intelligence";

export function AutomationPreviewQueuePanel() {
  const { data, loading, refresh, refreshing } = useCandidateAdvancementIntelligence();
  const queue = data?.automationPreviewQueue ?? [];

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Automation preview queue"
        subtitle="Preview only — Approve/Reject are disabled. No actions execute."
        actions={
          <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </ExecutiveButton>
        }
      />

      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Read-only Phase 1 queue. Candidates listed here are automation-eligible per P144 rules but nothing
        will move, send, or write to Breezy.
      </p>

      {loading && !data ? (
        <p className="mt-4 text-sm text-zinc-500">Loading automation preview queue…</p>
      ) : queue.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No automation-eligible candidates in the current cohort.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Project</th>
                <th className="pb-2 pr-3">Recruiter</th>
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
                  <td className="py-2 pr-3 font-medium text-zinc-100">{row.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-300">{row.project}</td>
                  <td className="py-2 pr-3 text-zinc-300">{row.recruiter}</td>
                  <td className="py-2 pr-3 text-zinc-200">{row.suggestedAction}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">{row.reason}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-200">{row.confidence}%</td>
                  <td className="py-2 pr-3 text-center">
                    <button
                      type="button"
                      disabled
                      title="Preview only — no execution"
                      className="cursor-not-allowed rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500"
                    >
                      Approve
                    </button>
                  </td>
                  <td className="py-2 text-center">
                    <button
                      type="button"
                      disabled
                      title="Preview only — no execution"
                      className="cursor-not-allowed rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500"
                    >
                      Reject
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
