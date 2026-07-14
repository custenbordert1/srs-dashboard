"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import type { P1864ConflictDashboard } from "@/lib/p186-4-lifecycle-reconciler/types";
import { useCallback, useEffect, useState } from "react";

export function P186ConflictDashboardPanel() {
  const [dashboard, setDashboard] = useState<P1864ConflictDashboard | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiting/p186-lifecycle-reconciler/status", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        enabled?: boolean;
        dashboard?: P1864ConflictDashboard;
        message?: string;
      };
      setEnabled(Boolean(data.enabled));
      setDashboard(data.dashboard ?? null);
      setMessage(data.message ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load conflict dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <SectionLoadingCard title="P186 Writer Conflicts" badge="P186.4" />;
  }

  if (!enabled || !dashboard) {
    return (
      <ExecutiveCard>
        <SectionHeader
          title="P186 Writer Conflicts"
          subtitle="Duplicate-writer and scheduler collision views — flag off (idle)."
          badge="P186.4"
        />
        <p className="mt-3 text-sm text-zinc-400">
          Enable with <code className="text-zinc-300">P186_CONFLICT_DASHBOARD=1</code>. Read-only;
          does not disable writers or enable schedulers.
        </p>
        {message ? (
          <div className="mt-3">
            <SectionDegradedBanner message={message} />
          </div>
        ) : null}
      </ExecutiveCard>
    );
  }

  const s = dashboard.summary;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="P186 Writer Conflicts"
          subtitle="Read-only inventory of competing lifecycle writers and schedulers. No destructive controls."
          badge="P186.4"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedBadge at={dashboard.generatedAt} />
          <StatusBadge tone="neutral">read-only</StatusBadge>
          <StatusBadge tone="success">no writers disabled</StatusBadge>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Writers" value={String(s.totalWriters)} />
        <MetricCard label="Duplicate groups" value={String(s.duplicateWriterGroups)} />
        <MetricCard label="Scheduler overlaps" value={String(s.schedulerOverlaps)} />
        <MetricCard label="Critical" value={String(s.criticalFindings)} />
        <MetricCard label="High" value={String(s.highFindings)} />
        <MetricCard label="Deprecated active" value={String(s.deprecatedStillReferenced)} />
        <MetricCard label="Direct mutations" value={String(s.directMutationPaths)} />
        <MetricCard label="Ownership gaps" value={String(s.missingOwnershipTransitions)} />
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        Recommended future reconcile cadence: {dashboard.recommendedCadence} (not enabled).
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-2 py-2">Severity</th>
              <th className="px-2 py-2">Kind</th>
              <th className="px-2 py-2">Transition</th>
              <th className="px-2 py-2">Writers</th>
              <th className="px-2 py-2">Owner</th>
              <th className="px-2 py-2">Retirement</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.findings.slice(0, 40).map((f) => (
              <tr key={f.id} className="border-t border-zinc-800/80 text-zinc-300">
                <td className="px-2 py-2">{f.severity}</td>
                <td className="px-2 py-2">{f.kind}</td>
                <td className="px-2 py-2">{f.transition ?? "—"}</td>
                <td className="px-2 py-2 text-xs">{f.activeWriters.slice(0, 4).join(", ")}</td>
                <td className="px-2 py-2 text-xs">{f.recommendedOwner}</td>
                <td className="px-2 py-2 text-xs">{f.recommendedRetirementAction}</td>
                <td className="px-2 py-2">{f.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dashboard.findings.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No conflict findings (flags may limit scope).</p>
        ) : null}
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase text-zinc-500">Recommended freeze order (plan only)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-400">
          {dashboard.freezeOrder.slice(0, 12).map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ol>
      </div>
    </ExecutiveCard>
  );
}
