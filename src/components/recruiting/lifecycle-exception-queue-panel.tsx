"use client";

import {
  SectionDegradedBanner,
  SectionErrorCard,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import { ExecutiveCard, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useLifecycleExceptionQueue } from "@/hooks/use-lifecycle-manager";
import { lifecycleStateLabel } from "@/lib/p171-autonomous-candidate-lifecycle-manager/presentation";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export function LifecycleExceptionQueuePanel() {
  const { report, warnings, loading, error, refresh } = useLifecycleExceptionQueue();

  if (loading) {
    return <SectionLoadingCard title="Lifecycle Exceptions" badge="P171" />;
  }

  if (error || !report) {
    return (
      <SectionErrorCard
        title="Lifecycle Exceptions"
        badge="P171"
        message={error ?? "Lifecycle exception queue unavailable"}
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="Lifecycle Exception Queue"
          subtitle="Recruiters handle only exceptions — duplicates, missing data, declined signatures, and API failures"
          badge="P171"
        />
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-4">
          <SectionDegradedBanner message={warnings.join(" · ")} />
        </div>
      ) : null}

      <p className="mt-2 text-xs text-zinc-500">
        Last lifecycle cycle: {formatTimestamp(report.lastCycleAt)}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total exceptions" value={String(report.totalExceptions)} />
        {report.byCategory.slice(0, 3).map((row) => (
          <MetricCard key={row.category} label={row.category} value={String(row.count)} />
        ))}
      </div>

      {report.exceptions.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-400">
          No active lifecycle exceptions. Qualified candidates progress automatically.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs text-zinc-300">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 pr-4">Candidate</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">State</th>
                <th className="pb-2 pr-4">Confidence</th>
                <th className="pb-2 pr-4">Reason</th>
              </tr>
            </thead>
            <tbody>
              {report.exceptions.map((row) => (
                <tr key={row.candidateId} className="border-t border-zinc-800/60">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-zinc-100">{row.candidateName}</div>
                    <div className="text-zinc-500">{row.position}</div>
                  </td>
                  <td className="py-2 pr-4">{row.category.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4">{lifecycleStateLabel(row.state)}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.confidence ?? "—"}</td>
                  <td className="py-2 pr-4 max-w-xs truncate" title={row.reason}>
                    {row.reason}
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
