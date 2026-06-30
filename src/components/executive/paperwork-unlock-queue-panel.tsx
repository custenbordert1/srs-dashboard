"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { P84OperationalQueueReport } from "@/lib/p84-operational-queue";
import { useCallback, useEffect, useState } from "react";

export function PaperworkUnlockQueuePanel() {
  const [queue, setQueue] = useState<P84OperationalQueueReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/p84-operational-queue?includeEntries=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        queue?: P84OperationalQueueReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.queue) {
        setError(data.error ?? "Failed to load paperwork unlock queue");
        return;
      }
      setQueue(data.queue);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load paperwork unlock queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !queue) {
    return <ExecutivePanelLoading title="Paperwork Unlock Queue" badge="P90 Preview" />;
  }

  if (error) {
    return (
      <ExecutivePanelError
        title="Paperwork Unlock Queue"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!queue) return null;

  const m = queue.metrics;

  return (
    <ExecutiveCard>
      <SectionHeader
        title={queue.sectionTitle}
        subtitle="Preview-only operational execution queue for P84 unlock (P90). No live sends."
      />
      <ExecutiveWarningList warnings={warnings} />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total unlockable" value={m.totalUnlockable.toLocaleString()} />
        <MetricCard label="Needs job publish" value={m.needsJobPublish.toLocaleString()} />
        <MetricCard label="Needs recruiter" value={m.needsRecruiterAssignment.toLocaleString()} />
        <MetricCard label="Needs DM" value={m.needsDmAssignment.toLocaleString()} />
        <MetricCard label="Needs P83" value={m.needsP83Advancement.toLocaleString()} />
        <MetricCard label="Ready for P84 preview" value={m.readyForP84Preview.toLocaleString()} />
        <MetricCard label="Monitor only" value={m.monitorOnly.toLocaleString()} />
        <MetricCard label="Blocked" value={m.blocked.toLocaleString()} />
      </div>
      {queue.unlockable.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Next action</th>
                <th className="pb-2">Owner</th>
              </tr>
            </thead>
            <tbody>
              {queue.unlockable.slice(0, 12).map((entry) => (
                <tr key={entry.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{entry.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-400">{entry.queueStatusLabel}</td>
                  <td className="py-2 pr-3 text-zinc-400">
                    {entry.nextAction?.requiredAction ?? "—"}
                  </td>
                  <td className="py-2 text-zinc-400">{entry.recommendedRecruiter}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.unlockable.length > 12 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Showing 12 of {queue.unlockable.length} unlockable candidates.
            </p>
          ) : null}
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
