"use client";

import { AppShell } from "@/components/auth/app-shell";
import { CandidatePipelineWidget } from "@/components/dm/candidate-pipeline-widget";
import { DmAttentionPanel } from "@/components/dm/dm-attention-panel";
import { DmOperationalDashboard } from "@/components/dm/dm-operational-dashboard";
import { RecruitingAutomationSection } from "@/components/recruiting/recruiting-automation-section";
import { isDmRole } from "@/lib/auth/roles";
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
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";

type DmDashboardProps = {
  user: UserPublic;
};

export function DmDashboard({ user }: DmDashboardProps) {
  const { data, meta, error, loading, refreshing, timedOut, refresh } =
    useTerritoryDashboard<DmDashboardSnapshot>({
      endpoint: "/api/dm/dashboard",
      cacheScope: user.id,
    });
  const drawer = useCandidateDrawer({
    territoryStates: data?.territoryStates ?? user.territoryStates,
  });

  const subtitle = isDmRole(user.role)
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
          {refreshing ? (
            <span className="ml-2 text-teal-400/90">Updating…</span>
          ) : null}
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

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          <p>{error}</p>
          {timedOut || error ? (
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 rounded-lg border border-red-400/40 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {meta?.partialSync ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Partial Breezy sync — some positions may not be included in candidate counts yet.
        </p>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading territory intelligence…</p>
      ) : null}

      {data ? (
        isDmRole(user.role) ? (
          <DmOperationalDashboard
            data={data}
            meta={meta}
            onCandidateClick={drawer.openCandidate}
            selectedCandidateId={drawer.selectedCandidateId}
          />
        ) : (
        <>
          <TerritoryHealthCard health={data.health} />

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {data.kpis.map((kpi) => (
              <article
                key={kpi.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-3 shadow-sm shadow-black/10"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{kpi.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{kpi.value}</p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">{kpi.hint}</p>
              </article>
            ))}
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

      <CandidateDetailDrawer {...drawer.drawerProps} />
    </AppShell>
  );
}
