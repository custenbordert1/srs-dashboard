"use client";

import type { OnboardingPipelineExecutiveSummary } from "@/lib/onboarding-pipeline-engine";
import { ExecutiveCard, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useCallback, useEffect, useState } from "react";

function formatDays(value: number | null): string {
  if (value == null) return "—";
  return `${value}d`;
}

export function OnboardingPipelineExecutiveCard() {
  const [summary, setSummary] = useState<OnboardingPipelineExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding-pipeline", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: { summary: OnboardingPipelineExecutiveSummary };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load onboarding pipeline preview");
        return;
      }
      setSummary(data.dashboard.summary);
    } catch {
      setError("Failed to load onboarding pipeline preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Onboarding Pipeline"
        subtitle="P81 welcome workflow engine — preview mode only. No production actions."
        badge="Preview"
        badgeTone="preview"
      />

      {loading ? (
        <p className="text-sm text-zinc-500">Loading pipeline summary…</p>
      ) : error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : summary ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total records" value={String(summary.totalRecords)} />
            <MetricCard label="Ready for work" value={String(summary.readyForWorkCount)} />
            <MetricCard label="Stalled" value={String(summary.stalledCount)} />
            <MetricCard label="Avg progress" value={`${summary.averageProgressPercent}%`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="Avg onboarding time" value={formatDays(summary.averageOnboardingDays)} />
            <MetricCard label="Ready this week" value={String(summary.readyThisWeekCount)} />
            <MetricCard label="Overdue onboarding" value={String(summary.overdueOnboardingCount)} />
            <MetricCard
              label="Est. ready this week"
              value={String(summary.estimatedReadyForWorkThisWeek)}
            />
            <MetricCard
              label="Bottleneck stage"
              value={summary.bottleneckStageLabel ?? "—"}
            />
            <MetricCard
              label="Longest waiting"
              value={
                summary.longestWaiting
                  ? `${summary.longestWaiting.candidateName} (${summary.longestWaiting.days}d)`
                  : "—"
              }
            />
          </div>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
