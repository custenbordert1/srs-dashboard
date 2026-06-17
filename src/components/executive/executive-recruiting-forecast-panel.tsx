"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useExecutiveRecruitingForecast } from "@/hooks/use-executive-recruiting-forecast";
import {
  FORECAST_QUICK_LINKS,
  formatForecastFreshness,
  forecastConfidenceLabel,
  projectRiskDeepLink,
  recommendationDeepLink,
  recommendationPriorityLabel,
} from "@/lib/executive-recruiting-forecast";
import type {
  DataTrustLevel,
  ForecastConfidenceLevel,
  ProjectRiskLevel,
  RecommendationPriority,
} from "@/lib/executive-recruiting-forecast";
import { TabSkeleton } from "@/components/ui/tab-skeleton";

const DATA_TRUST_STYLES: Record<DataTrustLevel, string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  degraded: "border-red-500/30 bg-red-500/10 text-red-100",
};

const FORECAST_CONFIDENCE_STYLES: Record<ForecastConfidenceLevel, string> = {
  high: "text-emerald-200",
  moderate: "text-amber-200",
  low: "text-red-200",
};

const RECOMMENDATION_PRIORITY_STYLES: Record<
  RecommendationPriority,
  { border: string; badge: string; label: string }
> = {
  critical: {
    border: "border-red-500/50",
    badge: "bg-red-500/20 text-red-100",
    label: "Critical",
  },
  high: {
    border: "border-amber-500/40",
    badge: "bg-amber-500/15 text-amber-100",
    label: "High",
  },
  medium: {
    border: "border-yellow-500/30",
    badge: "bg-yellow-500/10 text-yellow-100",
    label: "Medium",
  },
  low: {
    border: "border-zinc-700",
    badge: "bg-zinc-800/80 text-zinc-300",
    label: "Low",
  },
};

const PROJECT_RISK_STYLES: Record<ProjectRiskLevel, string> = {
  critical: "bg-red-500/20 text-red-100",
  high: "bg-amber-500/15 text-amber-100",
  medium: "bg-yellow-500/10 text-yellow-100",
  low: "bg-zinc-800 text-zinc-300",
};

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        <span className="text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="border-t border-zinc-800/80 px-4 pb-4 pt-3">{children}</div> : null}
    </section>
  );
}

export function ExecutiveRecruitingForecastPanel() {
  const { snapshot, loading, error, timedOut, refresh } = useExecutiveRecruitingForecast();

  if (loading && !snapshot) {
    return <TabSkeleton message="Loading executive recruiting forecast…" cards={4} rows={4} />;
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-sm text-red-100">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium hover:bg-red-500/20"
        >
          {timedOut ? "Retry forecast" : "Refresh"}
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-400">
        Forecast data is not available yet. Refresh once Breezy and MEL caches are warm.
      </div>
    );
  }

  const dataTrustLabel =
    snapshot.dataTrust === "high"
      ? "Data trust: Healthy sync"
      : snapshot.dataTrust === "partial"
        ? "Data trust: Partial sync"
        : "Data trust: Degraded";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Executive Recruiting Forecast</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Action-oriented staffing outlook — {formatForecastFreshness(snapshot.generatedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh forecast
        </button>
      </div>

      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 px-4 py-4">
        <p className="text-sm leading-relaxed text-zinc-100">{snapshot.executiveSummary.narrative}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {snapshot.executiveSummary.topRiskTerritory ? (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-red-100">
              Top risk: {snapshot.executiveSummary.topRiskTerritory.dmName} (
              {snapshot.executiveSummary.topRiskTerritory.territoryLabel})
            </span>
          ) : null}
          <span className={`rounded-full border border-zinc-700 px-2.5 py-1 ${FORECAST_CONFIDENCE_STYLES[snapshot.forecastConfidence]}`}>
            Forecast confidence: {forecastConfidenceLabel(snapshot.forecastConfidence)} (model)
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FORECAST_QUICK_LINKS.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-500/20"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Territories at risk" value={snapshot.kpis.territoriesAtRisk} />
        <KpiCard label="Overloaded recruiters" value={snapshot.kpis.overloadedRecruiters} />
        <KpiCard label="Overloaded DMs" value={snapshot.kpis.overloadedDms} />
        <KpiCard
          label="Forecasted hires (30d)"
          value={snapshot.kpis.projectedHires30}
          hint="Directional model — not a hiring guarantee"
        />
      </div>

      <div className={`rounded-lg border px-4 py-3 text-sm ${DATA_TRUST_STYLES[snapshot.dataTrust]}`}>
        <span className="font-semibold">{dataTrustLabel}</span>
        {snapshot.partialSync ? " · Breezy sync may be partial" : null}
        <p className="mt-1 text-xs opacity-90">
          Forecast confidence reflects model input quality, not statistical certainty.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Project completion risk</h3>
        {snapshot.projectCompletionRisks.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No elevated project risks detected.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {snapshot.projectCompletionRisks.slice(0, 8).map((row) => {
              const action = projectRiskDeepLink();
              return (
                <li
                  key={row.projectNo}
                  className={`rounded-lg border px-3 py-2 ${RECOMMENDATION_PRIORITY_STYLES[row.riskLevel === "critical" ? "critical" : row.riskLevel === "high" ? "high" : "medium"].border}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-zinc-200">
                      {row.projectName}{" "}
                      <span className="text-xs font-normal text-zinc-500">({row.projectNo})</span>
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PROJECT_RISK_STYLES[row.riskLevel]}`}>
                      {row.riskLevel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.territoryLabel} · DM {row.dmName}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{row.reasons.join(" · ")}</p>
                  <p className="mt-1 text-xs text-teal-300/90">{row.suggestedAction}</p>
                  <Link href={action.href} className="mt-2 inline-block text-xs font-medium text-teal-200 hover:underline">
                    {action.label} →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Territory shortage forecast</h3>
          {snapshot.territoryShortages.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No elevated territory shortages detected.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {snapshot.territoryShortages.slice(0, 6).map((row) => (
                <li
                  key={`${row.dmName}-${row.territoryLabel}`}
                  className={`rounded-lg border px-3 py-2 ${row.likelyMissCoverage ? "border-red-500/40 bg-red-500/5" : "border-zinc-800/80 bg-zinc-950/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-zinc-200">{row.dmName}</p>
                    <span className="text-xs tabular-nums text-amber-200">Risk {row.shortageScore}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{row.territoryLabel}</p>
                  <p className="mt-1 text-xs text-zinc-400">{row.reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Executive recommendations</h3>
          {snapshot.recommendations.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No urgent recommendations — capacity is stable.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {snapshot.recommendations.slice(0, 8).map((rec) => {
                const styles = RECOMMENDATION_PRIORITY_STYLES[rec.priority];
                const deepLink = recommendationDeepLink(rec);
                return (
                  <li key={rec.id} className={`rounded-lg border bg-zinc-950/40 px-3 py-2 ${styles.border}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-zinc-200">{rec.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${styles.badge}`}>
                        {recommendationPriorityLabel(rec.priority)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">{rec.rationale}</p>
                    <p className="mt-1 text-xs text-teal-300/90">{rec.expectedImpact}</p>
                    <Link href={deepLink.href} className="mt-2 inline-block text-xs font-medium text-teal-200 hover:underline">
                      {deepLink.label} →
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Hiring forecast by horizon</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Horizon</th>
                <th className="pb-2 pr-3">Hires</th>
                <th className="pb-2 pr-3">Applicants</th>
                <th className="pb-2">Interviews</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.hiringForecasts.map((row) => (
                <tr key={row.horizonDays} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.horizonDays} days</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.projectedHires}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.projectedApplicants}</td>
                  <td className="py-2 tabular-nums text-zinc-300">{row.projectedInterviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CollapsibleSection title="Predicted hires by week (90-day horizon)">
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {snapshot.weeklyHireForecast.slice(0, 12).map((week) => (
            <div key={week.weekLabel} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-2 py-2 text-center">
              <p className="text-[10px] uppercase text-zinc-500">{week.weekLabel}</p>
              <p className="text-lg font-semibold tabular-nums text-teal-200">{week.projectedHires}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Recruiter & DM capacity details">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-zinc-500">Recruiters</p>
            <ul className="mt-2 space-y-2">
              {snapshot.recruiterCapacity.map((row) => (
                <li key={row.recruiter} className="flex justify-between text-sm">
                  <span className="text-zinc-300">{row.recruiter}</span>
                  <span className={row.status === "overloaded" ? "text-red-200" : row.status === "underused" ? "text-zinc-400" : "text-teal-200"}>
                    {row.capacityScore} · {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase text-zinc-500">DMs</p>
            <ul className="mt-2 space-y-2">
              {snapshot.dmCapacity.map((row) => (
                <li key={row.dmName} className="flex justify-between text-sm">
                  <span className="text-zinc-300">{row.dmName}</span>
                  <span className={row.status === "overloaded" ? "text-red-200" : row.status === "underused" ? "text-zinc-400" : "text-teal-200"}>
                    {row.capacityScore} · {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CollapsibleSection>

      <details className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-500">
        <summary className="cursor-pointer font-medium text-zinc-400">How we calculate this</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {snapshot.assumptions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
