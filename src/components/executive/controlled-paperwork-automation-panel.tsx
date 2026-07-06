"use client";

import { ExecutiveCard, ExecutiveButton, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useControlledPaperworkAutomation } from "@/hooks/use-controlled-paperwork-automation";

export function ControlledPaperworkAutomationPanel() {
  const { data, loading, refresh, refreshing, showingCachedSnapshot } = useControlledPaperworkAutomation();
  const executive = data?.executive;

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Paperwork automation"
        subtitle="Controlled Phase 1 — approval required before any send or reminder."
        actions={
          <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </ExecutiveButton>
        }
      />

      {showingCachedSnapshot ? (
        <p className="mt-2 text-xs text-amber-300">Showing cached snapshot — live refresh failed.</p>
      ) : null}

      {loading && !data ? (
        <p className="mt-4 text-sm text-zinc-500">Loading paperwork automation metrics…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Outstanding paperwork" value={executive?.outstandingPaperwork ?? 0} />
          <MetricCard label="Ready to send" value={executive?.readyToSend ?? 0} />
          <MetricCard label="Ready for reminder" value={executive?.readyForReminder ?? 0} />
          <MetricCard label="Waiting on candidate" value={executive?.waitingOnCandidate ?? 0} />
          <MetricCard label="Manual review" value={executive?.manualReviewRequired ?? 0} />
          <MetricCard
            label="Avg days waiting"
            value={`${executive?.averageDaysWaiting ?? 0}d`}
          />
        </div>
      )}

      {executive && executive.recruitersWithLargestQueue.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Recruiters with largest queue
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {executive.recruitersWithLargestQueue.slice(0, 5).map((row) => (
                <li key={row.recruiter}>
                  {row.recruiter}: {row.count}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Projects with most outstanding
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {executive.projectsWithMostOutstanding.slice(0, 5).map((row) => (
                <li key={row.project}>
                  {row.project}: {row.count}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
