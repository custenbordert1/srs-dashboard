"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { P246DashboardMetrics } from "@/lib/p246-outstanding-paperwork-reminders/types";
import { useCallback, useEffect, useState } from "react";

export function P246OutstandingPaperworkRemindersPanel() {
  const [metrics, setMetrics] = useState<P246DashboardMetrics | null>(null);
  const [available, setAvailable] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/p246-reminder-metrics", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        available?: boolean;
        metrics?: P246DashboardMetrics | null;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to load P246 reminder metrics");
        return;
      }
      setAvailable(Boolean(data.available));
      setMetrics(data.metrics ?? null);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load P246 reminder metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ExecutivePanelLoading title="Outstanding paperwork reminders" badge="P246" />;
  }
  if (error) {
    return (
      <ExecutivePanelError
        title="Outstanding paperwork reminders"
        message={error}
        onRetry={load}
      />
    );
  }

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Outstanding paperwork reminders"
        subtitle="P246 — Dropbox Sign–verified reminder cadence (max 4). Does not resend packets."
      />
      {!available || !metrics ? (
        <p className="mt-3 text-sm text-zinc-500">
          No campaign snapshot yet. Run the P246 preview script to populate metrics.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Outstanding" value={metrics.totalOutstandingPaperwork} />
            <MetricCard label="Pending signature" value={metrics.pendingSignature} />
            <MetricCard label="Viewed not signed" value={metrics.viewedButNotSigned} />
            <MetricCard label="Needs recruiter" value={metrics.needsRecruiterFollowUp} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <MetricCard label="Reminder 1 due" value={metrics.reminder1Due} />
            <MetricCard label="Reminder 2 due" value={metrics.reminder2Due} />
            <MetricCard label="Reminder 3 due" value={metrics.reminder3Due} />
            <MetricCard label="Reminder 4 due" value={metrics.reminder4Due} />
            <MetricCard label="Max reminders" value={metrics.maximumRemindersReached} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <MetricCard
              label="Avg days sent→signed"
              value={
                metrics.averageDaysSentToSigned != null
                  ? String(metrics.averageDaysSentToSigned)
                  : "—"
              }
            />
            <MetricCard
              label="Reminder→sign rate"
              value={
                metrics.reminderToSignConversionRate != null
                  ? `${Math.round(metrics.reminderToSignConversionRate * 100)}%`
                  : "—"
              }
            />
            <MetricCard
              label="Snapshot"
              value={metrics.source}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Generated {metrics.generatedAt}
          </p>
        </>
      )}
      {warnings.length > 0 ? (
        <ul className="mt-2 text-xs text-muted-foreground">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </ExecutiveCard>
  );
}
