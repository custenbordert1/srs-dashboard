"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionErrorCard,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import { levelTone, useProductionReadiness } from "@/hooks/use-production-readiness";
import type { P160Recommendation, P160RiskSeverity } from "@/lib/p160-production-readiness/types";

const RECOMMENDATION_LABELS: Record<P160Recommendation, string> = {
  ready_for_server_deployment: "Ready for server deployment",
  ready_for_observation_mode: "Ready for observation mode",
  ready_for_controlled_production: "Ready for controlled production",
  not_ready: "Not ready",
};

const LEVEL_LABELS = { ready: "Ready", warning: "Warning", blocked: "Blocked" } as const;

function scoreTone(score: number): "success" | "warning" | "critical" | "neutral" {
  if (score >= 85) return "success";
  if (score >= 70) return "warning";
  return "critical";
}

function riskTone(severity: P160RiskSeverity): "success" | "warning" | "critical" | "neutral" {
  if (severity === "low") return "neutral";
  if (severity === "medium") return "warning";
  return "critical";
}

export function ProductionReadinessPanel() {
  const { report, error, loading, loadingCeilingHit, showingCachedSnapshot, meta, refresh } =
    useProductionReadiness();
  const snapshotStale = Boolean(meta?.stale);

  if (loading) {
    return <SectionLoadingCard title="Production Readiness" badge="P160" />;
  }

  if (loadingCeilingHit && !report) {
    return (
      <SectionErrorCard
        title="Production Readiness"
        badge="P160"
        message="Readiness assessment timed out — automation probes may still be running."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!report) {
    return (
      <SectionErrorCard
        title="Production Readiness"
        badge="P160"
        message={error ?? "Failed to load production readiness report"}
        onRetry={() => void refresh()}
      />
    );
  }

  const totalRisks =
    report.risks.critical.length +
    report.risks.high.length +
    report.risks.medium.length +
    report.risks.low.length;

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || snapshotStale || error) && (
        <SectionDegradedBanner
          stale={showingCachedSnapshot || snapshotStale}
          message={
            error ??
            (meta?.origin === "building"
              ? "Readiness snapshot is warming up — a fresh assessment is being computed in the background."
              : snapshotStale
                ? "Showing a stale readiness snapshot — refreshing in the background."
                : "Showing cached readiness snapshot.")
          }
          onRetry={() => void refresh()}
        />
      )}

      <ExecutiveCard id="p160-score" variant="premium">
        <SectionHeader
          title="Overall Readiness Score"
          actions={
            <LastUpdatedBadge
              at={report.generatedAt}
              stale={showingCachedSnapshot || snapshotStale}
              ageSeconds={meta?.ageSeconds ?? null}
              refreshing={meta?.refreshing}
            />
          }
          subtitle="Read-only assessment — no live actions performed"
          badge="P160"
        />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-4xl font-semibold text-zinc-100">{report.overallReadinessScore}</span>
          <span className="text-lg text-zinc-500">/ 100</span>
          <StatusBadge tone={scoreTone(report.overallReadinessScore)}>
            {RECOMMENDATION_LABELS[report.recommendation]}
          </StatusBadge>
        </div>
        <p className="text-sm text-zinc-300">{report.recommendationDetail}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            onClick={() => void refresh()}
          >
            Refresh assessment
          </button>
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p160-infrastructure">
        <SectionHeader title="Infrastructure" subtitle="Build, runtime, environment, secrets" />
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusBadge tone={levelTone(report.infrastructure.buildStatus)}>
            {`Build: ${LEVEL_LABELS[report.infrastructure.buildStatus]}`}
          </StatusBadge>
          <StatusBadge tone={report.infrastructure.nodeCompatible ? "success" : "critical"}>
            {report.infrastructure.nodeVersion}
          </StatusBadge>
          <StatusBadge tone={levelTone(report.infrastructure.runtimeHealth)}>
            {`Runtime: ${LEVEL_LABELS[report.infrastructure.runtimeHealth]}`}
          </StatusBadge>
        </div>
        <p className="mb-4 text-sm text-zinc-400">{report.infrastructure.buildDetail}</p>
        <p className="mb-4 text-sm text-zinc-400">{report.infrastructure.serverCompatibility}</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {report.infrastructure.secretsConfigured.map((item) => (
            <div key={item.id} className="rounded border border-zinc-800/60 px-3 py-2 text-sm">
              <StatusBadge tone={levelTone(item.status)}>{LEVEL_LABELS[item.status]}</StatusBadge>
              <span className="ml-2 text-zinc-300">{item.label}</span>
              <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p160-integrations">
        <SectionHeader title="Integrations" subtitle="Live dependency health probes" />
        <div className="mb-3">
          <StatusBadge tone={levelTone(report.integrations.overall)}>
            {`Overall: ${LEVEL_LABELS[report.integrations.overall]}`}
          </StatusBadge>
        </div>
        <ul className="space-y-2 text-sm text-zinc-300">
          {report.integrations.items.map((item) => (
            <li key={item.id} className="rounded border border-zinc-800/60 px-3 py-2">
              <StatusBadge tone={levelTone(item.status)}>{LEVEL_LABELS[item.status]}</StatusBadge>
              <span className="ml-2 font-medium">{item.label}</span>
              <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
            </li>
          ))}
        </ul>
      </ExecutiveCard>

      <ExecutiveCard id="p160-automation">
        <SectionHeader title="Automation Readiness" subtitle="P154–P159 module probes" />
        <div className="mb-4">
          <StatusBadge tone={levelTone(report.automation.overall)}>
            {`Overall: ${LEVEL_LABELS[report.automation.overall]}`}
          </StatusBadge>
        </div>
        <div className="space-y-3">
          {report.automation.phases.map((phase) => (
            <div key={phase.phase} className="rounded border border-zinc-800/60 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-zinc-200">{phase.label}</span>
                <StatusBadge tone={levelTone(phase.status)}>{LEVEL_LABELS[phase.status]}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-zinc-400">{phase.detail}</p>
              {phase.components?.length ? (
                <ul className="mt-2 list-inside list-disc text-xs text-zinc-500">
                  {phase.components.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p160-safety">
        <SectionHeader title="Safety Checklist" />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {report.safety.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2 rounded border border-zinc-800/60 px-3 py-2 text-sm">
              <StatusBadge tone={levelTone(item.status)}>{LEVEL_LABELS[item.status]}</StatusBadge>
              <div>
                <p className="text-zinc-300">{item.label}</p>
                <p className="text-xs text-zinc-500">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p160-deployment">
        <SectionHeader title="Deployment Checklist" subtitle="Server install steps" />
        <ul className="space-y-2 text-sm">
          {report.deployment.items.map((item) => (
            <li key={item.id} className="rounded border border-zinc-800/60 px-3 py-2 text-zinc-300">
              <span className="font-mono text-xs uppercase text-zinc-500">[{item.status}]</span>{" "}
              {item.step}
              <p className="mt-1 text-xs text-zinc-500">{item.detail}</p>
            </li>
          ))}
        </ul>
      </ExecutiveCard>

      <ExecutiveCard id="p160-risks">
        <SectionHeader title="Risk Assessment" subtitle={`${totalRisks} risks identified`} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Critical" value={String(report.risks.critical.length)} />
          <MetricCard label="High" value={String(report.risks.high.length)} />
          <MetricCard label="Medium" value={String(report.risks.medium.length)} />
          <MetricCard label="Low" value={String(report.risks.low.length)} />
        </div>
        {(["critical", "high", "medium", "low"] as const).map((severity) => {
          const items = report.risks[severity];
          if (items.length === 0) return null;
          return (
            <div key={severity} className="mt-4">
              <h4 className="mb-2 text-sm font-medium uppercase text-zinc-400">{severity}</h4>
              <ul className="space-y-2 text-sm">
                {items.map((risk) => (
                  <li key={risk.id} className="rounded border border-zinc-800/60 px-3 py-2">
                    <StatusBadge tone={riskTone(risk.severity)}>{risk.severity}</StatusBadge>
                    <span className="ml-2 font-medium text-zinc-200">{risk.title}</span>
                    <p className="mt-1 text-zinc-400">{risk.detail}</p>
                    <p className="mt-1 text-xs text-emerald-400/80">Mitigation: {risk.mitigation}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </ExecutiveCard>
    </div>
  );
}
