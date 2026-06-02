"use client";

import { AppShell } from "@/components/auth/app-shell";
import { CandidatePipelineWidget } from "@/components/dm/candidate-pipeline-widget";
import { DmAttentionPanel } from "@/components/dm/dm-attention-panel";
import { DmOperationalDashboard } from "@/components/dm/dm-operational-dashboard";
import { DmPortalDashboard } from "@/components/dm/dm-portal-dashboard-prototype";
import { RecruitingAutomationSection } from "@/components/recruiting/recruiting-automation-section";
import { isDmRole } from "@/lib/auth/roles";
import { getDmViewVisibility, resolveDmViewModeFromUser } from "@/lib/dm-portal/dm-view-mode";
import { TerritoryHealthCard } from "@/components/dm/territory-health-card";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import type { UserPublic } from "@/lib/auth/types";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import { CandidateDetailDrawer } from "@/components/recruiting/candidate-detail-drawer";
import { DmMelMatchingPanel } from "@/components/recruiting/mel-matching-metrics-panel";
import { CoverageRiskSection } from "@/components/recruiting/coverage-risk-section";
import { WorkforceOperationsSection } from "@/components/recruiting/workforce-operations-section";
import { DeferredSection } from "@/components/ui/deferred-section";
import { useCandidateDrawer } from "@/hooks/use-candidate-drawer";
import { DataTrustStatusBanner } from "@/components/ui/data-trust-badge";
import { TrustGatedKpiShell } from "@/components/ui/trust-gated-kpi";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";
import type { DataTrustInput } from "@/lib/data-trust-state";
import { resolveKpiTrustPresentation } from "@/lib/kpi-trust-gating";

type DmDashboardProps = {
  user: UserPublic;
};

export function DmDashboard({ user }: DmDashboardProps) {
  const viewMode = resolveDmViewModeFromUser(user);
  const visibility = getDmViewVisibility(viewMode);
  const { data, meta, error, loading, refreshing, timedOut, refresh, dataTrust } =
    useTerritoryDashboard<DmDashboardSnapshot>({
      endpoint: "/api/dm/dashboard",
      cacheScope: user.id,
    });
  const drawer = useCandidateDrawer({
    territoryStates: data?.territoryStates ?? user.territoryStates,
  });

  const dmTrustInput: DataTrustInput = {
    loading,
    refreshing,
    error,
    timedOut,
    hasData: Boolean(data),
    partialSync: meta?.partialSync,
    scanMode: meta?.scanMode,
    positionsScanned: meta?.positionsScanned,
    totalPositionsAvailable: meta?.totalPositionsAvailable,
  };

  const territorySubtitle =
    data?.territoryLabel ?? (user.territoryStates.join(", ") || "—");
  const subtitle = viewMode.enabled
    ? `DM portal · ${territorySubtitle}`
    : isDmRole(user.role)
    ? `Territory: ${user.territoryStates.join(", ") || "—"}`
    : "Admin view — all territories";

  return (
    <AppShell
      user={user}
      title={isDmRole(user.role) ? `${user.name} · Territory operations` : "DM territory intelligence"}
      subtitle={subtitle}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Live territory health · fill-risk alerts · coverage intelligence
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || refreshing}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Loading…" : refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      <DataTrustStatusBanner
        trust={dmTrustInput}
        state={dataTrust}
        onRetry={refresh}
        retrying={refreshing}
      />

      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading territory intelligence…</p>
      ) : null}

      {data ? (
        viewMode.enabled ? (
          <DmPortalDashboard
            data={data}
            visibility={visibility}
            territoryLabel={data.territoryLabel}
            user={user}
            meta={meta}
            refreshing={refreshing}
            onCandidateClick={drawer.openCandidate}
            selectedCandidateId={drawer.selectedCandidateId}
          />
        ) : isDmRole(user.role) ? (
          <DmOperationalDashboard
            data={data}
            user={user}
            meta={meta}
            onCandidateClick={drawer.openCandidate}
            selectedCandidateId={drawer.selectedCandidateId}
          />
        ) : (
        <>
          <TerritoryHealthCard health={data.health} />

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {data.kpis.map((kpi) => {
              const presentation = resolveKpiTrustPresentation(
                dataTrust,
                kpi.id,
                "dm-dashboard",
                dmTrustInput,
              );
              return (
                <TrustGatedKpiShell
                  key={kpi.id}
                  presentation={presentation}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3 shadow-sm shadow-black/10"
                >
                  <article>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {kpi.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{kpi.value}</p>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500">{kpi.hint}</p>
                  </article>
                </TrustGatedKpiShell>
              );
            })}
          </section>

          <DmMelMatchingPanel metrics={data.melMatching} onCandidateClick={drawer.openCandidate} />

          <DeferredSection
            title="Territory coverage alerts"
            description="High-risk projects, recruiting urgency, and best available reps."
            summary={
              <p className="text-sm text-zinc-500">
                Expand to load coverage risk for your territory.
              </p>
            }
          >
            <CoverageRiskSection variant="dm" />
          </DeferredSection>

          <DeferredSection
            title="Workforce operations"
            description="Rep roster import and opportunity matching."
            summary={
              <p className="text-sm text-zinc-500">Expand to load workforce intelligence.</p>
            }
          >
            <WorkforceOperationsSection />
          </DeferredSection>

          <DmAttentionPanel
            needsAttention={data.needsAttention}
            highestFillRisk={data.highestFillRisk}
            topCandidates={data.topCandidates}
            recentApplicants={data.recentApplicants}
            onCandidateClick={drawer.openCandidate}
            selectedCandidateId={drawer.selectedCandidateId}
          />

          <CandidatePipelineWidget
            pipeline={data.pipeline}
            onCandidateClick={drawer.openCandidate}
            selectedCandidateId={drawer.selectedCandidateId}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <IntelligenceBarChart
              title="Top problem cities"
              subtitle="Coverage risk score by city"
              data={data.coverage.topProblemCities}
              barClassName="bg-red-500/70"
            />
            <IntelligenceBarChart
              title="Hardest-to-fill territories"
              subtitle="Difficulty index by district manager"
              data={data.coverage.hardestToFillTerritories}
              barClassName="bg-amber-500/70"
            />
            <IntelligenceBarChart
              title="Candidate shortages by state"
              subtitle="Open jobs minus candidates"
              data={data.coverage.candidateShortagesByState}
              barClassName="bg-orange-500/70"
            />
            <IntelligenceBarChart
              title="Hiring velocity trends"
              subtitle="Weekly applicant volume"
              data={data.coverage.hiringVelocityTrends}
              barClassName="bg-teal-500/80"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <IntelligenceBarChart
              title="Top hiring cities"
              subtitle="Published jobs in territory"
              data={data.topHiringCities}
              barClassName="bg-teal-500/80"
            />
            <IntelligenceBarChart
              title="Candidate sources"
              subtitle="Applicants in territory"
              data={data.candidateSources}
              barClassName="bg-violet-500/80"
            />
          </div>

          <DeferredSection
            title="AI automation & recommendations"
            description="Rankings, suggested actions, smart alerts, productivity, and trend charts for your territory."
            summary={
              <p className="text-sm text-zinc-500">
                Expand to load AI recruiting automation for your territory.
              </p>
            }
          >
            <RecruitingAutomationSection compact />
          </DeferredSection>

          <p className="text-xs text-zinc-600">
            Snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.activeJobs} jobs · heatmap{" "}
            {data.heatmap.meta.cellCount} cities prepped for map viz
            {meta?.refreshedAt ? ` · refreshed ${new Date(meta.refreshedAt).toLocaleTimeString()}` : ""}
          </p>
        </>
        )
      ) : null}

      {data ? <CandidateDetailDrawer {...drawer.drawerProps} /> : null}
    </AppShell>
  );
}
