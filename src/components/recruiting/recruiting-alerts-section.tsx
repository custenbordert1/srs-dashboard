"use client";

import { useRecruitingIntelligence } from "@/hooks/use-recruiting-intelligence";
import type { RecruitingAlert, RecruitingAlertSeverity } from "@/lib/recruiting-alert-engine";

const SEVERITY_STYLES: Record<
  RecruitingAlertSeverity,
  { card: string; badge: string; dot: string }
> = {
  critical: {
    card: "border-red-500/35 bg-red-500/10 text-red-50 shadow-red-950/20",
    badge: "bg-red-500/25 text-red-100 ring-red-400/40",
    dot: "bg-red-400",
  },
  warning: {
    card: "border-amber-500/35 bg-amber-500/10 text-amber-50 shadow-amber-950/20",
    badge: "bg-amber-500/25 text-amber-100 ring-amber-400/40",
    dot: "bg-amber-400",
  },
  healthy: {
    card: "border-emerald-500/30 bg-emerald-500/10 text-emerald-50 shadow-emerald-950/20",
    badge: "bg-emerald-500/25 text-emerald-100 ring-emerald-400/40",
    dot: "bg-emerald-400",
  },
};

function AlertCard({ alert }: { alert: RecruitingAlert }) {
  const styles = SEVERITY_STYLES[alert.severity];
  return (
    <li
      className={`group rounded-xl border px-4 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${styles.card}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden />
          <div>
            <p className="font-medium">{alert.title}</p>
            <p className="mt-1 text-xs opacity-90">{alert.detail}</p>
            {alert.territoryLabel ? (
              <p className="mt-1 text-[10px] uppercase tracking-wide opacity-70">
                {alert.territoryLabel}
              </p>
            ) : null}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${styles.badge}`}
        >
          {alert.severity}
        </span>
      </div>
    </li>
  );
}

type RecruitingAlertsSectionProps = {
  compact?: boolean;
  limit?: number;
};

export function RecruitingAlertsSection({ compact = false, limit }: RecruitingAlertsSectionProps) {
  const { data, error, loading, refreshing } = useRecruitingIntelligence();
  const maxItems = limit ?? (compact ? 10 : 20);

  if (loading && !data) {
    return (
      <section className="space-y-3">
        <div className="h-7 w-48 animate-pulse rounded bg-zinc-800/80" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {error}
      </p>
    );
  }

  if (!data) return null;

  const alerts = data.recruitingAlerts.slice(0, maxItems);
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;
  const healthy = alerts.filter((a) => a.severity === "healthy").length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Recruiting alerts</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Automated pipeline, territory, and coverage signals
            {refreshing ? <span className="ml-2 text-teal-400/90">Updating…</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-200">
            {critical} critical
          </span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-200">
            {warning} warning
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
            {healthy} healthy
          </span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="text-sm text-zinc-500">No alerts for this territory right now.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </ul>
      )}
    </section>
  );
}
