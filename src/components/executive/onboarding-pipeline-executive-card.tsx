"use client";

import type { OnboardingPipelineExecutiveSummary } from "@/lib/onboarding-pipeline-engine";
import { ExecutiveCard, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useCallback, useEffect, useState } from "react";

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
        subtitle="Post-paperwork autonomous onboarding — preview mode only."
        badge="Preview"
        badgeTone="preview"
      />

      {loading ? (
        <p className="text-sm text-zinc-500">Loading pipeline summary…</p>
      ) : error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : summary ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total records" value={String(summary.totalRecords)} />
          <MetricCard label="Ready for work" value={String(summary.readyForWorkCount)} />
          <MetricCard label="Stalled" value={String(summary.stalledCount)} />
          <MetricCard label="Avg progress" value={`${summary.averageProgressPercent}%`} />
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
