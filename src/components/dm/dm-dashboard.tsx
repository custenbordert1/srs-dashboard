"use client";

import { AppShell } from "@/components/auth/app-shell";
import { CandidatePipelineWidget } from "@/components/dm/candidate-pipeline-widget";
import { DmAttentionPanel } from "@/components/dm/dm-attention-panel";
import { RecruitingAutomationSection } from "@/components/recruiting/recruiting-automation-section";
import { TerritoryHealthCard } from "@/components/dm/territory-health-card";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import type { UserPublic } from "@/lib/auth/types";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import { CandidateDetailDrawer } from "@/components/recruiting/candidate-detail-drawer";
import { DmMelMatchingPanel } from "@/components/recruiting/mel-matching-metrics-panel";
import { useCandidateDrawer } from "@/hooks/use-candidate-drawer";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";

type DmDashboardProps = {
  user: UserPublic;
};

export function DmDashboard({ user }: DmDashboardProps) {
  const { data, meta, error, loading, refreshing, refresh } = useTerritoryDashboard<DmDashboardSnapshot>({
    endpoint: "/api/dm/dashboard",
  });
  const drawer = useCandidateDrawer({
    territoryStates: data?.territoryStates ?? user.territoryStates,
  });

  const subtitle =
    user.role === "dm"
      ? `Territory: ${user.territoryStates.join(", ") || "—"}`
      : "Executive view — all territories";

  return (
    <AppShell
      user={user}
      title={user.role === "dm" ? `${user.name} · Territory intelligence` : "DM territory intelligence"}
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
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
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

          <section className="border-t border-zinc-800/80 pt-8">
            <h2 className="text-lg font-semibold text-zinc-50">AI automation & recommendations</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Rankings, suggested actions, smart alerts, productivity, and trend charts for your territory.
            </p>
            <div className="mt-6">
              <RecruitingAutomationSection compact />
            </div>
          </section>

          <p className="text-xs text-zinc-600">
            Snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.activeJobs} jobs · heatmap{" "}
            {data.heatmap.meta.cellCount} cities prepped for map viz
            {meta?.refreshedAt ? ` · refreshed ${new Date(meta.refreshedAt).toLocaleTimeString()}` : ""}
          </p>
        </>
      ) : null}

      <CandidateDetailDrawer {...drawer.drawerProps} />
    </AppShell>
  );
}
