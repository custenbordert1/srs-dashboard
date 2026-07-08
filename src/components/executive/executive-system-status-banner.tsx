"use client";

import { LastUpdatedBadge } from "@/components/ui/loading-state";
import { DisabledByDesignBadge } from "@/components/ui/loading-state/disabled-by-design-badge";
import { SectionDegradedBanner } from "@/components/ui/loading-state/section-degraded-banner";
import { SectionErrorCard } from "@/components/ui/loading-state/section-error-card";
import { SectionLoadingCard } from "@/components/ui/loading-state/section-loading-card";
import type { P161AppHealthReport } from "@/lib/app-loading-reliability/build-app-health";
import { useResilientSectionData } from "@/hooks/use-resilient-section-data";

function parseAppHealth(json: unknown): P161AppHealthReport {
  const body = json as { report?: P161AppHealthReport };
  if (!body.report) throw new Error("App health report missing");
  return body.report;
}

export function ExecutiveSystemStatusBanner() {
  const { data, isLoading, isStale, error, warning, loadingCeilingHit, lastSuccessAt, retry } =
    useResilientSectionData<P161AppHealthReport>({
      cacheKey: "p161:app-health",
      url: "/api/recruiting/app-health",
      parse: parseAppHealth,
      label: "System status",
    });

  if (isLoading) {
    return <SectionLoadingCard title="System status" badge="P161" rows={2} />;
  }

  if ((loadingCeilingHit || error) && !data) {
    return (
      <SectionErrorCard
        title="System status unavailable"
        badge="P161"
        message={error ?? "System status timed out — automation probes may still be running."}
        onRetry={() => void retry()}
      />
    );
  }

  if (!data) return null;

  const { operatingMode, systemStatus } = data;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-4 sm:p-5">
      {(isStale || warning || error) && (
        <div className="mb-3">
          <SectionDegradedBanner
            stale={isStale}
            message={warning ?? error ?? "Showing last known system status."}
            onRetry={() => void retry()}
          />
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Platform status</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">{operatingMode.label}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <DisabledByDesignBadge mode="observation" label="Continuous automation OFF" />
            <DisabledByDesignBadge mode="manual" label="Manual batches" />
            {operatingMode.daemonRunning ? (
              <span className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100">
                Daemon running
              </span>
            ) : (
              <DisabledByDesignBadge mode="disabled" label="Daemon stopped" />
            )}
          </div>
        </div>
        <LastUpdatedBadge at={lastSuccessAt ?? data.generatedAt} stale={isStale} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Paperwork sent today" value={String(systemStatus.paperworkSentToday)} />
        <Metric label="Send batches today" value={String(systemStatus.sendBatchesToday)} />
        <Metric label="Failures today" value={String(systemStatus.failuresToday)} />
        <Metric label="Eligible now" value={String(systemStatus.eligibleNow)} />
        <Metric label="Queue remaining" value={String(systemStatus.queueRemaining)} />
        <Metric
          label="Last production cycle"
          value={
            systemStatus.lastProductionCycle
              ? new Date(systemStatus.lastProductionCycle).toLocaleString()
              : "—"
          }
        />
        <Metric
          label="Daemon"
          value={systemStatus.daemonRunning ? "Running" : "Stopped"}
        />
        <Metric
          label="Readiness score"
          value={systemStatus.readinessScore != null ? `${systemStatus.readinessScore}/100` : "—"}
        />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-zinc-100">{value}</dd>
    </div>
  );
}
