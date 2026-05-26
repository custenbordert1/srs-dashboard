"use client";

import { DmAlertOperationsKpis } from "@/components/dm/dm-alert-operations-kpis";
import { CandidatePipelineWidget } from "@/components/dm/candidate-pipeline-widget";
import { DmAttentionPanel } from "@/components/dm/dm-attention-panel";
import { DmOnboardingStatusCard } from "@/components/dm/dm-onboarding-status-card";
import { DmPriorityAlertsPanel } from "@/components/dm/dm-priority-alerts-panel";
import { TerritoryHealthCard } from "@/components/dm/territory-health-card";
import { CoverageRiskSection } from "@/components/recruiting/coverage-risk-section";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import { DeferredSection } from "@/components/ui/deferred-section";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";

type DmDashboardMeta = {
  partialSync?: boolean;
};

type DmOperationalDashboardProps = {
  data: DmDashboardSnapshot;
  meta?: DmDashboardMeta | null;
  onCandidateClick: (candidateId: string) => void;
  selectedCandidateId: string | null;
};

export function DmOperationalDashboard({
  data,
  meta,
  onCandidateClick,
  selectedCandidateId,
}: DmOperationalDashboardProps) {
  return (
    <>
      <TerritoryHealthCard health={data.health} />

      <DmAlertOperationsKpis summary={data.alertSummary} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.kpis
          .filter((kpi) =>
            [
              "active-jobs",
              "candidates-7d",
              "paperwork-signed",
              "dd-pending",
            ].includes(kpi.id),
          )
          .map((kpi) => (
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

      <DmOnboardingStatusCard onboarding={data.onboarding} />

      <DmPriorityAlertsPanel alerts={data.prioritizedAlerts} />

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

      <DeferredSection
        title="Coverage gaps"
        description="Open opportunities and staffing risk in your territory."
        summary={<p className="text-sm text-zinc-500">Expand to load coverage intelligence.</p>}
      >
        <CoverageRiskSection variant="dm" />
      </DeferredSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceBarChart
          title="Open opportunities by state"
          subtitle="MEL demand in your territory"
          data={data.coverage.candidateShortagesByState}
          barClassName="bg-teal-500/80"
        />
        <IntelligenceBarChart
          title="Coverage gaps by city"
          subtitle="Highest risk cities"
          data={data.coverage.topProblemCities}
          barClassName="bg-red-500/70"
        />
      </div>

      <p className="text-xs text-zinc-600">
        Territory snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.activeJobs} active jobs ·{" "}
        {data.territoryLabel}
        {meta?.partialSync ? " · partial Breezy sync" : ""}
      </p>
    </>
  );
}
