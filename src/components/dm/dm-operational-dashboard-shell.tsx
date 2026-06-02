"use client";

import { DmAlertOperationsKpis } from "@/components/dm/dm-alert-operations-kpis";
import { CandidatePipelineWidget } from "@/components/dm/candidate-pipeline-widget";
import { DmAttentionPanel } from "@/components/dm/dm-attention-panel";
import { DmOnboardingStatusCard } from "@/components/dm/dm-onboarding-status-card";
import { DmOperationalDrawer } from "@/components/dm/dm-operational-drawer";
import { DmPriorityAlertsPanel } from "@/components/dm/dm-priority-alerts-panel";
import { DmToast } from "@/components/dm/dm-toast";
import { TerritoryHealthCard } from "@/components/dm/territory-health-card";
import { CoverageRiskSection } from "@/components/recruiting/coverage-risk-section";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import { DeferredSection } from "@/components/ui/deferred-section";
import { TrustGatedKpiShell } from "@/components/ui/trust-gated-kpi";
import { useDmOperationalDrawer } from "@/hooks/use-dm-operational-drawer";
import { buildDataTrustState, type DataTrustInput } from "@/lib/data-trust-state";
import { resolveKpiTrustPresentation } from "@/lib/kpi-trust-gating";
import type { UserPublic } from "@/lib/auth/types";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmAlertPriorityFilter } from "@/lib/dm-dashboard/dm-alert-priority";
import { useState } from "react";

type DmOperationalDashboardShellProps = {
  data: DmDashboardSnapshot;
  user: UserPublic;
  meta?: {
    partialSync?: boolean;
    scanMode?: string | null;
    positionsScanned?: number;
    totalPositionsAvailable?: number;
  } | null;
  onCandidateClick: (candidateId: string) => void;
  selectedCandidateId: string | null;
};

export function DmOperationalDashboardShell({
  data,
  user,
  meta,
  onCandidateClick,
  selectedCandidateId,
}: DmOperationalDashboardShellProps) {
  const ops = useDmOperationalDrawer(data, user);
  const [prioritySeed, setPrioritySeed] = useState<DmAlertPriorityFilter>("all");
  const trustInput: DataTrustInput = {
    hasData: true,
    partialSync: meta?.partialSync,
    scanMode: meta?.scanMode,
    positionsScanned: meta?.positionsScanned,
    totalPositionsAvailable: meta?.totalPositionsAvailable,
  };
  const dataTrust = buildDataTrustState(trustInput);

  return (
    <>
      <TerritoryHealthCard health={data.health} />

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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.kpis
          .filter((kpi) =>
            ["active-jobs", "candidates-7d", "paperwork-signed", "dd-pending"].includes(kpi.id),
          )
          .map((kpi) => {
            const presentation = resolveKpiTrustPresentation(
              dataTrust,
              kpi.id,
              "dm-dashboard",
              trustInput,
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

      <DmOnboardingStatusCard onboarding={data.onboarding} />

      <DmPriorityAlertsPanel
        key={prioritySeed}
        alerts={data.prioritizedAlerts}
        onAlertClick={ops.openAlert}
        initialPriorityFilter={prioritySeed}
      />

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
          subtitle="MEL demand in your territory — click a state to drill down"
          data={data.coverage.candidateShortagesByState}
          barClassName="bg-teal-500/80"
          onItemClick={(item) => ops.openState(item.label)}
        />
        <IntelligenceBarChart
          title="Coverage gaps by city"
          subtitle="Highest risk cities — click to drill down"
          data={data.coverage.topProblemCities}
          barClassName="bg-red-500/70"
          onItemClick={(item) => ops.openCityLabel(item.label)}
        />
      </div>

      <p className="text-xs text-zinc-600">
        Territory snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.activeJobs} active jobs ·{" "}
        {data.territoryLabel}
        {meta?.partialSync ? " · partial Breezy sync" : ""}
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
    </>
  );
}
