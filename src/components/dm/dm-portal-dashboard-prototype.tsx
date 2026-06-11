"use client";

import { DmActionCenter } from "@/components/dm/dm-action-center";
import { DmAlertOperationsKpis } from "@/components/dm/dm-alert-operations-kpis";
import { CandidatePipelineWidget } from "@/components/dm/candidate-pipeline-widget";
import { DmAttentionPanel } from "@/components/dm/dm-attention-panel";
import { DmOnboardingStatusCard } from "@/components/dm/dm-onboarding-status-card";
import { DmOperationalDrawer } from "@/components/dm/dm-operational-drawer";
import { DmPriorityAlertsPanel } from "@/components/dm/dm-priority-alerts-panel";
import { DmToast } from "@/components/dm/dm-toast";
import { CoverageRiskSection } from "@/components/recruiting/coverage-risk-section";
import { DmMelMatchingPanel } from "@/components/recruiting/mel-matching-metrics-panel";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import { useDmOperationalDrawer } from "@/hooks/use-dm-operational-drawer";
import type { UserPublic } from "@/lib/auth/types";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmAlertPriorityFilter, DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import {
  DM_PORTAL_NAV_LINKS,
  DM_PORTAL_SECTION_IDS,
  buildDmPortalOperationalView,
  coverageTierLabel,
  coverageTierStyles,
  severityLabel,
  topNeedsAttentionAlerts,
} from "@/lib/dm-portal/dm-portal-operational";
import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { TrustGatedKpiShell } from "@/components/ui/trust-gated-kpi";
import { buildDataTrustState, type DataTrustInput, type DataTrustState } from "@/lib/data-trust-state";
import { resolveKpiTrustPresentation } from "@/lib/kpi-trust-gating";
import type { DmViewVisibility } from "@/lib/dm-portal/dm-view-mode";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DmPortalDashboardProps = {
  data: DmDashboardSnapshot;
  visibility: DmViewVisibility;
  territoryLabel: string;
  user: UserPublic;
  meta?: {
    partialSync?: boolean;
    scanMode?: string;
    positionsScanned?: number;
    totalPositionsAvailable?: number;
  } | null;
  refreshing?: boolean;
  onCandidateClick: (candidateId: string) => void;
  selectedCandidateId: string | null;
};

/** @deprecated Use `DmPortalDashboard` — alias kept for imports. */
export type DmPortalDashboardPrototypeProps = DmPortalDashboardProps;

function SectionShell({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatCell({
  statId,
  label,
  value,
  hint,
  trustState,
  trustInput,
}: {
  statId: string;
  label: string;
  value: string;
  hint?: string;
  trustState: DataTrustState;
  trustInput: DataTrustInput;
}) {
  const presentation = resolveKpiTrustPresentation(
    trustState,
    statId,
    "dm-territory-stat",
    trustInput,
  );
  return (
    <TrustGatedKpiShell
      presentation={presentation}
      className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-[10px] leading-snug text-zinc-600">{hint}</p> : null}
    </TrustGatedKpiShell>
  );
}

function priorityBadgeClass(priority: DmPrioritizedAlert["priority"]): string {
  switch (priority) {
    case "critical":
      return "bg-red-500 text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-amber-500 text-zinc-950";
    default:
      return "bg-zinc-600 text-zinc-100";
  }
}

function NeedsAttentionList({
  alerts,
  onAlertClick,
}: {
  alerts: DmPrioritizedAlert[];
  onAlertClick: (alert: DmPrioritizedAlert) => void;
}) {
  if (alerts.length === 0) {
    return <p className="text-sm text-zinc-500">No territory alerts right now.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-800/80">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <button
            type="button"
            onClick={() => onAlertClick(alert)}
            className="flex w-full flex-wrap items-start justify-between gap-3 py-3 text-left transition hover:bg-zinc-950/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadgeClass(alert.priority)}`}
                >
                  {severityLabel(alert.priority)}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">{alert.alertTypeLabel}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-zinc-100">{alert.title}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{alert.detail}</p>
              <p className="mt-1 text-[11px] text-zinc-600">{alert.recommendedAction}</p>
              <span className="mt-2 inline-flex text-xs font-medium text-teal-400">Open operational detail →</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NavCard({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-3 transition hover:border-teal-500/40 hover:bg-teal-500/5"
    >
      <p className="text-sm font-semibold text-zinc-100 group-hover:text-teal-100">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
      <p className="mt-2 text-[11px] font-medium text-teal-400/90">Jump to section →</p>
    </Link>
  );
}

export function DmPortalDashboard({
  data,
  visibility,
  territoryLabel,
  user,
  meta,
  refreshing = false,
  onCandidateClick,
  selectedCandidateId,
}: DmPortalDashboardProps) {
  const operational = buildDmPortalOperationalView(data);
  const { territory, pipeline } = operational;
  const tierStyles = coverageTierStyles(territory.coverageTier);
  const topAlerts = topNeedsAttentionAlerts(data);
  const trustInput: DataTrustInput = {
    refreshing,
    hasData: true,
    partialSync: meta?.partialSync,
    scanMode: meta?.scanMode,
    positionsScanned: meta?.positionsScanned,
    totalPositionsAvailable: meta?.totalPositionsAvailable,
  };
  const dataTrust = buildDataTrustState(trustInput);
  const ops = useDmOperationalDrawer(data, user);
  const [prioritySeed, setPrioritySeed] = useState<DmAlertPriorityFilter>("all");
  const actionCenterJobs = useMemo(
    () =>
      Object.values(data.operationalIndex.jobsById)
        .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
        .slice(0, 20),
    [data.operationalIndex.jobsById],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const candidateId = params.get("candidateId");
    if (candidateId) onCandidateClick(candidateId);
    const jobId = params.get("jobId");
    if (jobId) ops.openJob(jobId);
    if (!window.location.hash) return;
    const id = window.location.hash.replace(/^#/, "");
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data.fetchedAt, onCandidateClick, ops.openJob]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300/90">DM territory operations</p>
            <p className="mt-1 text-sm text-zinc-300">
              Live view for <span className="font-medium text-zinc-100">{data.dmName}</span> · {territoryLabel}
            </p>
          </div>
          <DataTrustBadge
            trust={{
              hasData: true,
              partialSync: meta?.partialSync,
              scanMode: meta?.scanMode,
              positionsScanned: meta?.positionsScanned,
              totalPositionsAvailable: meta?.totalPositionsAvailable,
            }}
            state={dataTrust}
          />
        </div>
      </div>

      <section id={DM_PORTAL_SECTION_IDS.quickNav} className="scroll-mt-24">
        <h2 className="text-sm font-semibold text-zinc-100">Quick navigation</h2>
        <p className="mt-1 text-xs text-zinc-500">Jump to sections on this dashboard.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DM_PORTAL_NAV_LINKS.map((item) => (
            <NavCard key={item.id} label={item.label} description={item.description} href={item.href} />
          ))}
        </div>
      </section>

      {visibility.showOpenJobs ? (
        <SectionShell
          id={DM_PORTAL_SECTION_IDS.territorySummary}
          title="Territory summary"
          description="Assigned states and live recruiting demand in your territory."
        >
          <p className="mb-3 text-xs text-zinc-400">
            <span className="font-medium text-zinc-300">{territory.stateCount} states:</span>{" "}
            {territory.states.join(", ") || "—"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <StatCell
              statId="open-jobs"
              label="Open jobs"
              value={territory.openJobs.toLocaleString()}
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <StatCell
              statId="open-calls"
              label="Open calls"
              value={territory.openCalls.toLocaleString()}
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <StatCell
              statId="active-reps"
              label="Active reps"
              value={territory.activeReps.toLocaleString()}
              hint="Onboarded + hired proxy"
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <StatCell
              statId="territory-health"
              label="Territory health"
              value={`${territory.coveragePercent}%`}
              hint={`${coverageTierLabel(territory.coverageTier)} · composite recruiting index`}
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <StatCell
              statId="alerts"
              label="Alerts"
              value={operational.needsAttentionTotal.toLocaleString()}
              hint={`${data.alertSummary.criticalCount} critical`}
              trustState={dataTrust}
              trustInput={trustInput}
            />
          </div>
        </SectionShell>
      ) : null}

      <SectionShell
        id={DM_PORTAL_SECTION_IDS.actionCenter}
        title="DM action center"
        description="Request recruiting support, assign recruiters, and track coverage requests."
      >
        <DmActionCenter
          territory={territory}
          jobs={actionCenterJobs}
          user={user}
          onOpenJob={ops.openJob}
          onToast={(message, tone) => ops.showToast(message, tone)}
          onEscalationSubmitted={ops.syncEscalationLogs}
        />
      </SectionShell>

      {visibility.showCoveragePercent ? (
        <section
          id={DM_PORTAL_SECTION_IDS.territoryHealth}
          className={`scroll-mt-24 rounded-xl border px-4 py-4 ${tierStyles.border} ${tierStyles.bg}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={`text-sm font-semibold ${tierStyles.text}`}>Territory health</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Territory health score · {data.health.label}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tierStyles.text} ${tierStyles.border}`}
            >
              {coverageTierLabel(territory.coverageTier)}
            </span>
          </div>
          <div className="mt-4">
            <TrustGatedKpiShell
              presentation={resolveKpiTrustPresentation(
                dataTrust,
                "territory-health",
                "dm-territory-stat",
                trustInput,
              )}
            >
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-4xl font-semibold tabular-nums ${tierStyles.text}`}>
                {territory.coveragePercent}%
              </p>
              <p className="text-xs text-zinc-500">Green ≥80% · Yellow 50–79% · Red &lt;50%</p>
            </div>
            </TrustGatedKpiShell>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-950/80">
              <div
                className={`h-full rounded-full transition-all ${tierStyles.meter}`}
                style={{ width: `${Math.min(100, Math.max(0, territory.coveragePercent))}%` }}
              />
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.health.factors.map((factor) => (
                <li key={factor.id} className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-zinc-300">{factor.label}</span>
                    <span className="tabular-nums text-zinc-500">{factor.score}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-600">{factor.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div id={DM_PORTAL_SECTION_IDS.alertKpis} className="scroll-mt-24">
        <DmAlertOperationsKpis
          summary={data.alertSummary}
          trustState={dataTrust}
          trustInput={trustInput}
          onCriticalClick={() => setPrioritySeed("critical")}
          onHighClick={() => setPrioritySeed("high")}
          onAgingClick={() => {
            const hit = data.prioritizedAlerts.find((row) => row.category.includes("job-aging"));
            if (hit) ops.openAlert(hit);
          }}
          onZeroApplicantsClick={() => {
            const hit = data.prioritizedAlerts.find((row) => row.category === "no-applicants-7d");
            if (hit) ops.openAlert(hit);
          }}
        />
      </div>

      <SectionShell
        id={DM_PORTAL_SECTION_IDS.recruitingPipeline}
        title="Recruiting pipeline summary"
        description="Applicant flow and onboarding progress in your assigned states."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCell
            statId="candidates-7d"
            label="Applicants (7 days)"
            value={pipeline.applicantsLast7Days.toLocaleString()}
            trustState={dataTrust}
            trustInput={trustInput}
          />
          <StatCell
            statId="paperwork-signed"
            label="Paperwork sent"
            value={pipeline.paperworkSent.toLocaleString()}
            trustState={dataTrust}
            trustInput={trustInput}
          />
          <StatCell
            statId="ready-for-mel"
            label="Ready for MEL"
            value={pipeline.readyForMel.toLocaleString()}
            hint="DD approved + MEL project matches"
            trustState={dataTrust}
            trustInput={trustInput}
          />
          <StatCell
            statId="hired"
            label="Hired"
            value={pipeline.hired.toLocaleString()}
            trustState={dataTrust}
            trustInput={trustInput}
          />
        </div>
      </SectionShell>

      <DmOnboardingStatusCard onboarding={data.onboarding} />

      {visibility.showNeedsAttention ? (
        <SectionShell
          id={DM_PORTAL_SECTION_IDS.needsAttention}
          title="Needs attention"
          description="Top 10 prioritized alerts — tap to open job or city detail."
        >
          <NeedsAttentionList alerts={topAlerts} onAlertClick={ops.openAlert} />
        </SectionShell>
      ) : null}

      <div id={DM_PORTAL_SECTION_IDS.priorityAlerts} className="scroll-mt-24">
        <DmPriorityAlertsPanel
          key={prioritySeed}
          alerts={data.prioritizedAlerts}
          onAlertClick={ops.openAlert}
          initialPriorityFilter={prioritySeed}
        />
      </div>

      <div id={DM_PORTAL_SECTION_IDS.candidates} className="scroll-mt-24 space-y-6">
        <DmAttentionPanel
          needsAttention={data.needsAttention}
          highestFillRisk={data.highestFillRisk}
          topCandidates={data.topCandidates}
          recentApplicants={data.recentApplicants}
          onCandidateClick={onCandidateClick}
          selectedCandidateId={selectedCandidateId}
          candidatesOnly
        />

        <CandidatePipelineWidget
          pipeline={data.pipeline}
          onCandidateClick={onCandidateClick}
          selectedCandidateId={selectedCandidateId}
        />
      </div>

      {visibility.showOpenOpportunities ? (
        <>
          <DmMelMatchingPanel metrics={data.melMatching} onCandidateClick={onCandidateClick} />

          <SectionShell
            id={DM_PORTAL_SECTION_IDS.openOpportunities}
            title="Open opportunities"
            description="High-priority unstaffed MEL stores in your territory."
          >
            {data.melMatching.unstaffedHighPriorityStores.length === 0 ? (
              <p className="text-sm text-zinc-500">No high-priority unstaffed stores flagged.</p>
            ) : (
              <ul className="divide-y divide-zinc-800/80">
                {data.melMatching.unstaffedHighPriorityStores.slice(0, 8).map((row, index) => (
                  <li key={`${row.projectName}-${row.state}-${index}`} className="py-2.5">
                    <p className="text-sm font-medium text-zinc-100">{row.projectName}</p>
                    <p className="text-xs text-zinc-500">
                      {row.client} · {row.storeName} · {row.state}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionShell>
        </>
      ) : null}

      <SectionShell
        id={DM_PORTAL_SECTION_IDS.coverageIssues}
        title="Coverage issues"
        description="Cities and states with the highest shortage signals — tap a bar to drill down."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <IntelligenceBarChart
            title="Open opportunities by state"
            subtitle="MEL demand in your territory"
            data={data.coverage.candidateShortagesByState}
            barClassName="bg-teal-500/80"
            onItemClick={(item) => ops.openState(item.label)}
          />
          <IntelligenceBarChart
            title="Coverage gaps by city"
            subtitle="Highest risk cities"
            data={data.coverage.topProblemCities}
            barClassName="bg-red-500/70"
            onItemClick={(item) => ops.openCityLabel(item.label)}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          {data.alertSummary.criticalCount} critical · {data.alertSummary.highCount} high ·{" "}
          {data.alertSummary.zeroApplicantJobsCount} jobs with zero applicants (7d)
        </p>
      </SectionShell>

      <SectionShell
        id="dm-live-coverage-risk"
        title="Live coverage risk"
        description="MEL staffing gaps and nearby rep coverage in your territory."
      >
        <CoverageRiskSection variant="dm" />
      </SectionShell>

      <SectionShell
        id={DM_PORTAL_SECTION_IDS.candidateQueue}
        title="Recent applicants"
        description="Latest applicants in your territory — open a profile for workflow context."
      >
        {data.recentApplicants.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent applicants in this snapshot.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {data.recentApplicants.slice(0, 10).map((row) => (
              <li key={row.candidateId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{row.name}</p>
                  <p className="text-xs text-zinc-500">
                    {row.position} · {row.city}, {row.state} · {row.stage}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCandidateClick(row.candidateId)}
                  className="text-xs font-medium text-teal-400 hover:text-teal-300"
                >
                  View profile
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionShell>

      <p className="text-xs text-zinc-600">
        Snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.activeJobs} active jobs ·{" "}
        {data.territoryLabel}
      </p>

      <DmOperationalDrawer
        open={ops.open}
        view={ops.view}
        escalationLogs={ops.escalationLogs}
        onClose={ops.close}
        onEscalation={ops.logEscalation}
        onSelectJob={ops.openJob}
      />
      <DmToast toast={ops.toast} onDismiss={ops.dismissToast} />
    </div>
  );
}

/** @deprecated Use `DmPortalDashboard`. */
export const DmPortalDashboardPrototype = DmPortalDashboard;
