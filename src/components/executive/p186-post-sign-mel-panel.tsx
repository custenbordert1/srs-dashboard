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
import type { P1865PostSignDashboard } from "@/lib/p186-5-post-sign-mel-queue";
import { useCallback, useEffect, useState } from "react";

function formatAge(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function P186PostSignMelPanel() {
  const [dashboard, setDashboard] = useState<P1865PostSignDashboard | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiting/p186-post-sign/status", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        enabled?: boolean;
        dashboard?: P1865PostSignDashboard;
        message?: string;
      };
      setEnabled(Boolean(data.enabled));
      setDashboard(data.dashboard ?? null);
      setMessage(data.message ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load post-sign dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <SectionLoadingCard title="P186 Post-Sign / MEL Queue" badge="P186.5" />;
  }

  if (!enabled || !dashboard) {
    return (
      <ExecutiveCard>
        <SectionHeader
          title="P186 Post-Sign / MEL Queue"
          subtitle="Shadow post-sign → onboarding → MEL queue preview. Flags off (idle)."
          badge="P186.5"
        />
        <p className="mt-3 text-sm text-zinc-400">
          Enable with <code className="text-zinc-300">P186_POST_SIGN_HEALTH_DASHBOARD=1</code>. Never
          auto-exports to MEL. Never sends paperwork.
        </p>
        {message ? (
          <div className="mt-3">
            <SectionDegradedBanner message={message} />
          </div>
        ) : null}
      </ExecutiveCard>
    );
  }

  const h = dashboard.health;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="P186 Post-Sign / MEL Queue"
          subtitle="Observe signed paperwork, validate onboarding, queue MEL export review — no MEL writes."
          badge="P186.5"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedBadge at={dashboard.generatedAt} />
          <StatusBadge tone="neutral">read-only default</StatusBadge>
          <StatusBadge tone="success">MEL write disabled</StatusBadge>
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
        <MetricCard label="Awaiting onboarding" value={String(h.signedAwaitingOnboardingReview)} />
        <MetricCard label="Missing docs (aged)" value={String(h.missingDocumentsOverThreshold)} />
        <MetricCard label="Ready MEL aging" value={formatAge(h.readyForMelAgingMs.oldest)} />
        <MetricCard label="MEL blocked" value={String(dashboard.queues.find((q) => q.queueId === "mel_export_blocked")?.count ?? 0)} />
        <MetricCard label="Dup queue conflicts" value={String(h.duplicateQueueConflicts)} />
        <MetricCard label="Signed≠production" value={String(h.signedNotInProduction)} />
        <MetricCard label="Failed recon" value={String(h.failedReconciliation)} />
        <MetricCard label="MEL queue rows" value={String(dashboard.melQueue.length)} />
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {dashboard.queues
          .filter((q) => q.count > 0)
          .map((q) => (
            <div key={q.queueId} className="rounded-xl border border-zinc-800 p-3">
              <p className="text-xs text-zinc-500">{q.label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">{q.count}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                oldest {formatAge(q.oldestAgeMs)} · avg {formatAge(q.averageAgeMs)}
              </p>
            </div>
          ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-2 py-2">Candidate</th>
              <th className="px-2 py-2">Job</th>
              <th className="px-2 py-2">Checklist</th>
              <th className="px-2 py-2">Production</th>
              <th className="px-2 py-2">Shadow</th>
              <th className="px-2 py-2">Recommended</th>
              <th className="px-2 py-2">Age</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.items.slice(0, 50).map((item) => (
              <tr key={item.candidateId} className="border-t border-zinc-800/80 text-zinc-300">
                <td className="px-2 py-2">
                  {item.displayName}
                  <div className="text-[11px] text-zinc-500">{item.state}</div>
                </td>
                <td className="px-2 py-2 text-xs">{item.jobOrProject ?? "—"}</td>
                <td className="px-2 py-2">{item.checklistCompletionPct}%</td>
                <td className="px-2 py-2">{item.productionState ?? "—"}</td>
                <td className="px-2 py-2">{item.shadowState ?? "—"}</td>
                <td className="px-2 py-2 text-xs">{item.recommendedAction}</td>
                <td className="px-2 py-2">{formatAge(item.ageMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dashboard.items.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No post-sign queue items in current cohort.</p>
        ) : null}
      </div>

      <p className="mt-4 text-[11px] text-zinc-600">
        Safety: production writes {dashboard.safety.productionWritesAttempted}, MEL writes{" "}
        {dashboard.safety.melWritesAttempted}, paperwork sends{" "}
        {dashboard.safety.paperworkSendsAttempted}.
      </p>
    </ExecutiveCard>
  );
}
