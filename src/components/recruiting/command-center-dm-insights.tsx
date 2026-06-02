"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { TrustGatedKpiShell } from "@/components/ui/trust-gated-kpi";
import type { DataTrustInput, DataTrustState } from "@/lib/data-trust-state";
import { KPI_PRELIMINARY_ALERT_LABEL, resolveKpiTrustPresentation } from "@/lib/kpi-trust-gating";
import {
  coverageTierLabel,
  coverageTierStyles,
} from "@/lib/dm-portal/dm-portal-operational";
import type {
  CommandCenterDmInsightsSnapshot,
  CommandCenterTerritoryInsight,
  CommandCenterTerritoryRiskAlert,
} from "@/lib/command-center-dm-insights";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import Link from "next/link";

type CommandCenterDmInsightsProps = {
  insights: CommandCenterDmInsightsSnapshot;
  loadingExtras?: boolean;
  territoryTrust?: DataTrustInput | null;
  territoryTrustState?: DataTrustState;
};

function StatCell({
  statId,
  category,
  label,
  value,
  hint,
  trustState,
  trustInput,
}: {
  statId: string;
  category: "command-center-territory" | "command-center-recruiting-health";
  label: string;
  value: string;
  hint?: string;
  trustState: DataTrustState;
  trustInput?: DataTrustInput | null;
}) {
  const presentation = resolveKpiTrustPresentation(
    trustState,
    statId,
    category,
    trustInput ?? undefined,
  );
  return (
    <TrustGatedKpiShell
      presentation={presentation}
      className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-zinc-600">{hint}</p> : null}
    </TrustGatedKpiShell>
  );
}

function QuickLinkCard({
  label,
  description,
  onClick,
  href,
}: {
  label: string;
  description: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "group rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-3 text-left transition hover:border-teal-500/40 hover:bg-teal-500/5";
  const body = (
    <>
      <p className="text-sm font-semibold text-zinc-100 group-hover:text-teal-100">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
      <p className="mt-2 text-[11px] font-medium text-teal-400/90">Open →</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function TerritoryRow({
  row,
  trustState,
  trustInput,
}: {
  row: CommandCenterTerritoryInsight;
  trustState: DataTrustState;
  trustInput?: DataTrustInput | null;
}) {
  const tier = coverageTierStyles(row.coverageTier);
  const healthPresentation = resolveKpiTrustPresentation(
    trustState,
    "territory-health",
    "command-center-territory",
    trustInput ?? undefined,
  );
  const callsPresentation = resolveKpiTrustPresentation(
    trustState,
    "open-calls",
    "command-center-territory",
    trustInput ?? undefined,
  );
  return (
    <tr className="border-t border-zinc-800/80">
      <td className="py-2.5 pr-3 text-sm font-medium text-zinc-100">{row.dmName}</td>
      <td className="py-2.5 pr-3 text-xs text-zinc-500">{row.states.length} states</td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm text-zinc-200">{row.openJobs}</td>
      <td
        className={`py-2.5 pr-3 text-right tabular-nums text-sm text-zinc-200 ${callsPresentation.dim ? "opacity-55" : ""}`}
      >
        {row.openCalls}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm text-zinc-200">{row.activeReps}</td>
      <td className={`py-2.5 text-right ${healthPresentation.dim ? "opacity-55" : ""}`}>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${tier.border} ${tier.bg} ${tier.text}`}
        >
          {row.coveragePercent}% · {coverageTierLabel(row.coverageTier)}
        </span>
        {healthPresentation.preliminaryAlert ? (
          <p className="mt-1 text-[10px] italic text-zinc-500">{KPI_PRELIMINARY_ALERT_LABEL}</p>
        ) : null}
      </td>
    </tr>
  );
}

function RiskAlertList({
  title,
  alerts,
  emptyLabel,
  preliminary,
}: {
  title: string;
  alerts: CommandCenterTerritoryRiskAlert[];
  emptyLabel: string;
  preliminary?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      {alerts.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 ${preliminary ? "opacity-55" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    alert.severity === "critical"
                      ? "bg-red-500/20 text-red-200"
                      : alert.severity === "high"
                        ? "bg-orange-500/15 text-orange-100"
                        : "bg-amber-500/10 text-amber-100"
                  }`}
                >
                  {preliminary ? `${KPI_PRELIMINARY_ALERT_LABEL} · ` : ""}
                  {alert.severity}
                </span>
                {alert.dmName ? (
                  <span className="text-[10px] text-zinc-600">{alert.dmName}</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium text-zinc-100">{alert.title}</p>
              <p className="text-xs text-zinc-500">{alert.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CommandCenterDmInsights({
  insights,
  loadingExtras,
  territoryTrust,
  territoryTrustState = "live",
}: CommandCenterDmInsightsProps) {
  const { recruitingHealth, topTerritoriesNeedingAttention, riskAlerts } = insights;
  const alertListsPreliminary =
    territoryTrustState === "partial" ||
    territoryTrustState === "degraded" ||
    territoryTrustState === "unavailable";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">DM operational insights</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Territory health, recruiting pipeline, and coverage risk — derived from live Breezy sync
            {insights.hasCoverageData ? ", MEL coverage risk" : ""}, and workflow state.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {territoryTrust ? <DataTrustBadge trust={territoryTrust} /> : null}
          {loadingExtras ? (
            <span className="text-xs text-teal-400/90">Syncing coverage & workflows…</span>
          ) : null}
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Quick links</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLinkCard label="DM portal" description="Territory operations dashboard" href="/dm" />
          <QuickLinkCard
            label="Recruiting"
            description="Candidate queue and workflow actions"
            onClick={() => navigateRecruitingTab({ tab: "candidates" })}
          />
          <QuickLinkCard
            label="Open opportunities"
            description="MEL projects and store demand"
            onClick={() => navigateRecruitingTab({ tab: "mel-projects" })}
          />
          <QuickLinkCard
            label="Coverage issues"
            description="Needs attention and risk signals"
            onClick={() => navigateRecruitingTab({ tab: "needs-attention" })}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-zinc-100">DM health summary</h3>
          <p className="mt-1 text-xs text-zinc-500">Top 5 territories needing attention right now.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left">
              <thead>
                <tr className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-3">DM</th>
                  <th className="pb-2 pr-3">States</th>
                  <th className="pb-2 pr-3 text-right">Open jobs</th>
                  <th className="pb-2 pr-3 text-right">Open calls</th>
                  <th className="pb-2 pr-3 text-right">Active reps</th>
                  <th className="pb-2 text-right">Territory health</th>
                </tr>
              </thead>
              <tbody>
                {topTerritoriesNeedingAttention.map((row) => (
                  <TerritoryRow
                    key={row.dmName}
                    row={row}
                    trustState={territoryTrustState}
                    trustInput={territoryTrust}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Recruiting health summary</h3>
          <p className="mt-1 text-xs text-zinc-500">Organization-wide pipeline from Breezy and workflows.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatCell
              statId="applicants-7d"
              category="command-center-recruiting-health"
              label="Applicants (7 days)"
              value={recruitingHealth.applicantsLast7Days.toLocaleString()}
              trustState={territoryTrustState}
              trustInput={territoryTrust}
            />
            <StatCell
              statId="paperwork-sent"
              category="command-center-recruiting-health"
              label="Paperwork sent"
              value={recruitingHealth.paperworkSent.toLocaleString()}
              trustState={territoryTrustState}
              trustInput={territoryTrust}
            />
            <StatCell
              statId="ready-for-mel"
              category="command-center-recruiting-health"
              label="Ready for MEL"
              value={recruitingHealth.readyForMel.toLocaleString()}
              hint="Workflow status Ready for MEL / Signed"
              trustState={territoryTrustState}
              trustInput={territoryTrust}
            />
            <StatCell
              statId="hired"
              category="command-center-recruiting-health"
              label="Hired"
              value={recruitingHealth.hired.toLocaleString()}
              trustState={territoryTrustState}
              trustInput={territoryTrust}
            />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-zinc-100">Territory risk alerts</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Critical shortages, unstaffed high-priority stores, and coverage below{" "}
          {insights.hasCoverageData ? "50%" : "threshold"}.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <RiskAlertList
            title="Critical shortages"
            alerts={riskAlerts.criticalShortages}
            emptyLabel="No critical MEL shortages flagged."
            preliminary={alertListsPreliminary}
          />
          <RiskAlertList
            title="Unstaffed high-priority"
            alerts={riskAlerts.unstaffedHighPriority}
            emptyLabel="No high-priority unstaffed stores."
            preliminary={alertListsPreliminary}
          />
          <RiskAlertList
            title="Below coverage threshold"
            alerts={riskAlerts.belowThreshold}
            emptyLabel="All territories at or above threshold."
            preliminary={alertListsPreliminary}
          />
        </div>
      </section>
    </div>
  );
}
