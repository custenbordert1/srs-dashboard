"use client";

import { TabSkeleton } from "@/components/ui/tab-skeleton";
import { WorkspaceErrorRecovery } from "@/components/ui/workspace-error-recovery";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { ProductionReadinessSnapshot } from "@/lib/production-readiness";
import type { ProductionScorecardRow } from "@/lib/production-readiness/build-production-scorecard";
import type { PlatformPageDiagnostic } from "@/lib/platform-diagnostics/build-platform-diagnostics-report";
import { UI_BADGE, UI_BUTTON, UI_LAYOUT, UI_RISK, UI_SPACE, UI_SURFACE, UI_TYPE } from "@/lib/ui-tokens";
import { useEffect, useState } from "react";

const STATUS_STYLES = {
  healthy: "text-teal-300 bg-teal-500/10 border-teal-500/30",
  degraded: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  offline: "text-red-300 bg-red-500/10 border-red-500/30",
  unknown: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
} as const;

const SCORECARD_TIER_STYLES: Record<ProductionScorecardRow["tier"], string> = {
  critical: UI_RISK.critical,
  "at-risk": UI_RISK.atRisk,
  stable: UI_RISK.stable,
  healthy: UI_RISK.healthy,
};

const DIAGNOSTIC_STATUS_STYLES: Record<PlatformPageDiagnostic["status"], string> = {
  "on-target": UI_BADGE.healthy,
  "at-risk": UI_BADGE.high,
  unknown: UI_BADGE.neutral,
};

export function SystemAdminCenter() {
  const [snapshot, setSnapshot] = useState<ProductionReadinessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/admin/production-readiness", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as { ok?: boolean; snapshot?: ProductionReadinessSnapshot; error?: string };
        if (cancelled) return;
        if (!parsed.ok || !parsed.snapshot) {
          setError(parsed.error ?? "Unable to load system administration center.");
          return;
        }
        setError(null);
        setSnapshot(parsed.snapshot);
      } catch {
        if (!cancelled) setError("Unable to load system administration center.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loading && !snapshot) {
    return <TabSkeleton message="Loading system administration center…" rows={6} cards={5} />;
  }

  if (error && !snapshot) {
    return (
      <WorkspaceErrorRecovery
        error={error}
        onRetry={() => {
          setLoading(true);
          setReloadToken((token) => token + 1);
        }}
      />
    );
  }

  if (!snapshot) return null;

  return (
    <div className={UI_SPACE.page}>
      <div className={UI_LAYOUT.pageHeader}>
        <div>
          <h2 className={UI_TYPE.pageTitle}>System Administration Center</h2>
          <p className={UI_TYPE.pageSubtitle}>
            Enterprise readiness — users, audit, integrations, data quality, and deployment diagnostics
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReloadToken((token) => token + 1);
          }}
          className={UI_BUTTON.ghost}
        >
          Refresh
        </button>
      </div>

      {snapshot.demoMode.enabled ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
          {snapshot.demoMode.label} is active — sample sections available for leadership demos.
        </div>
      ) : null}

      <section className={`${UI_SURFACE.panel} ${SCORECARD_TIER_STYLES[snapshot.productionScorecard.overallTier]}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className={UI_TYPE.sectionTitle}>Production scorecard</h3>
            <p className="mt-1 text-sm opacity-90">
              Reliability, performance, coverage, data quality, and user readiness
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold tabular-nums">{snapshot.productionScorecard.overallScore}</p>
            <p className="text-sm capitalize opacity-90">
              {snapshot.productionScorecard.overallTier.replace("-", " ")}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {snapshot.productionScorecard.dimensions.map((row) => (
            <div
              key={row.id}
              className={`rounded-xl border px-3 py-3 ${SCORECARD_TIER_STYLES[row.tier]}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{row.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{row.score}</p>
              <p className="mt-1 text-xs opacity-90">{row.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={UI_SURFACE.panel}>
        <h3 className={UI_TYPE.sectionTitle}>Platform diagnostics</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Load targets: normal &lt;{snapshot.platformDiagnostics.apiTargets.normalMs}ms · heavy &lt;
          {snapshot.platformDiagnostics.apiTargets.heavyMs}ms
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {snapshot.platformDiagnostics.pages.map((page) => (
            <div key={page.id} className={`${UI_SURFACE.cardInset} p-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{page.label}</p>
                <span className={DIAGNOSTIC_STATUS_STYLES[page.status]}>
                  {page.status.replace("-", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {page.category} · {page.loadClass} · lazy {page.lazyLoaded ? "yes" : "no"}
              </p>
              <p className="mt-2 text-xs text-zinc-400">{page.notes}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={UI_SURFACE.cardInset + " px-3 py-2"}>
            <p className={UI_TYPE.kpiLabel}>Cache hit rate</p>
            <p className={UI_TYPE.kpiValue}>{snapshot.platformDiagnostics.serverSignals.cacheHitRate}%</p>
          </div>
          <div className={UI_SURFACE.cardInset + " px-3 py-2"}>
            <p className={UI_TYPE.kpiLabel}>Lazy tabs</p>
            <p className={UI_TYPE.kpiValue}>{snapshot.platformDiagnostics.serverSignals.lazyTabCount}</p>
          </div>
          <div className={UI_SURFACE.cardInset + " px-3 py-2"}>
            <p className={UI_TYPE.kpiLabel}>Integrations healthy</p>
            <p className={UI_TYPE.kpiValue}>
              {snapshot.platformDiagnostics.serverSignals.integrationHealthy}/
              {snapshot.platformDiagnostics.serverSignals.integrationTotal}
            </p>
          </div>
          <div className={UI_SURFACE.cardInset + " px-3 py-2"}>
            <p className={UI_TYPE.kpiLabel}>Sync failures</p>
            <p className={UI_TYPE.kpiValue}>{snapshot.platformDiagnostics.serverSignals.syncFailures}</p>
          </div>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-zinc-400">
          {snapshot.platformDiagnostics.clientGuidance.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Users", value: snapshot.users.filter((u) => u.active).length },
          { label: "Cache hit rate", value: `${snapshot.performance.serverCacheHitRate}%` },
          { label: "Data issues", value: snapshot.dataQuality.length },
          { label: "Deployment checks", value: `${snapshot.deploymentChecklist.filter((c) => c.passed).length}/${snapshot.deploymentChecklist.length}` },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{kpi.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Integration status</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.integrationStatus.map((row) => (
            <div
              key={row.id}
              className={`rounded-lg border px-3 py-2 ${STATUS_STYLES[row.status]}`}
            >
              <p className="text-sm font-medium">{row.label}</p>
              <p className="mt-0.5 text-xs opacity-90">{row.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">Permission matrix</h3>
          <div className="mt-3 space-y-2">
            {snapshot.permissionMatrix.map((row) => (
              <div key={row.role} className="rounded-lg border border-zinc-800/80 px-3 py-2">
                <p className="text-sm font-medium text-zinc-100">{row.label}</p>
                <p className="text-xs text-zinc-500">{row.description}</p>
                <p className="mt-1 text-xs text-zinc-400">{row.permissions.join(" · ")}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">User management</h3>
          <div className="mt-3 max-h-64 overflow-y-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                {snapshot.users.slice(0, 15).map((user) => (
                  <tr key={user.id}>
                    <td className="px-2 py-1.5">{user.name}</td>
                    <td className="px-2 py-1.5">{user.role}</td>
                    <td className="px-2 py-1.5">{user.active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Data quality center</h3>
        <div className="mt-3 space-y-2">
          {snapshot.dataQuality.length === 0 ? (
            <p className="text-sm text-zinc-500">No data quality issues detected.</p>
          ) : (
            snapshot.dataQuality.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-zinc-800/80 px-3 py-2">
                <p className="text-sm font-medium text-zinc-100">{issue.title}</p>
                <p className="text-xs text-zinc-400">{issue.detail}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">Audit & activity</h3>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm text-zinc-300">
            {snapshot.auditActivity.slice(0, 12).map((entry) => (
              <li key={entry.id} className="rounded border border-zinc-800/80 px-3 py-2">
                <span className="text-xs text-zinc-500">{entry.source}</span> · {entry.summary}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">Login history</h3>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm text-zinc-300">
            {snapshot.loginHistory.map((entry) => (
              <li key={`${entry.timestamp}:${entry.userId}`} className="rounded border border-zinc-800/80 px-3 py-2">
                {entry.outcome} · {entry.userId} · {entry.timestamp}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Deployment readiness</h3>
        <ul className="mt-3 space-y-2">
          {snapshot.deploymentChecklist.map((item) => (
            <li
              key={item.id}
              className={`rounded-lg border px-3 py-2 text-sm ${item.passed ? "border-teal-500/30 text-teal-100" : "border-amber-500/30 text-amber-100"}`}
            >
              {item.passed ? "✓" : "○"} {item.label} — {item.detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Executive demo mode</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {snapshot.demoMode.sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-zinc-800/80 px-3 py-2">
              <p className="text-sm font-medium text-zinc-100">{section.title}</p>
              <p className="text-xs text-zinc-400">{section.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
