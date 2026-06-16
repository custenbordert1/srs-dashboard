"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type {
  CoverageOptimizationSimulatorSnapshot,
  SimulatorScenarioKind,
  SimulatorScenarioResult,
} from "@/lib/coverage-optimization-simulator";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import {
  UI_BUTTON,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type SimulatorResponse = {
  ok?: boolean;
  snapshot?: CoverageOptimizationSimulatorSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
    scopedToTerritory?: boolean;
    scopedToRecruiter?: boolean;
  };
  error?: string;
};

type CoverageOptimizationSimulatorPanelProps = {
  compact?: boolean;
};

const SCENARIO_OPTIONS: Array<{ kind: SimulatorScenarioKind; label: string }> = [
  { kind: "increase-pay", label: "Increase Pay" },
  { kind: "expand-radius", label: "Expand Radius" },
  { kind: "add-recruiter", label: "Add Recruiter" },
  { kind: "add-budget", label: "Add Budget" },
  { kind: "re-engage-candidates", label: "Re-Engage Candidates" },
  { kind: "territory-blitz", label: "Territory Blitz" },
  { kind: "refresh-job-postings", label: "Refresh Job Postings" },
];

function KpiCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">
        {value}
        {suffix ? <span className="text-base font-medium text-zinc-400">{suffix}</span> : null}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${UI_SURFACE.panel} border-zinc-800/80 bg-zinc-950/40 p-4`}>
      <div className="mb-3">
        <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
        {subtitle ? <p className={UI_TYPE.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ImpactDelta({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${
          neutral ? "text-zinc-300" : positive ? "text-emerald-300" : "text-red-300"
        }`}
      >
        {positive && value > 0 ? "+" : ""}
        {value}
        {suffix ?? ""}
      </p>
    </div>
  );
}

function ScenarioRow({
  scenario,
  active,
  onSelect,
}: {
  scenario: SimulatorScenarioResult;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left ${
        active
          ? "border-teal-500/40 bg-teal-500/10"
          : "border-zinc-800/80 bg-zinc-900/30 hover:border-teal-500/20"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-50">{scenario.label}</p>
        <p className="mt-0.5 text-xs text-zinc-400">
          ROI {scenario.expectedRoiScore} · {scenario.confidenceScore}% confidence
          {scenario.territoryLabel ? ` · ${scenario.territoryLabel}` : ""}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          +{scenario.impact.difference.additionalCandidates} candidates · +
          {scenario.impact.difference.coveragePercent}% coverage · −
          {scenario.impact.difference.openCallsReduced} open calls
        </p>
      </div>
    </button>
  );
}

export function CoverageOptimizationSimulatorPanel({
  compact = false,
}: CoverageOptimizationSimulatorPanelProps) {
  const [snapshot, setSnapshot] = useState<CoverageOptimizationSimulatorSnapshot | null>(null);
  const [meta, setMeta] = useState<SimulatorResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>("");
  const [selectedScenarioKind, setSelectedScenarioKind] = useState<SimulatorScenarioKind | "">("");
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedTerritoryId) params.set("territoryId", selectedTerritoryId);
      if (selectedScenarioKind) params.set("scenario", selectedScenarioKind);
      const query = params.toString();
      const response = await fetchWithTimeout(
        `/api/coverage-optimization-simulator${query ? `?${query}` : ""}`,
        { timeoutMs: FETCH_T4_INTELLIGENCE_MS },
      );
      const payload = (await response.json()) as SimulatorResponse;
      if (!response.ok || !payload.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Failed to load coverage optimization simulator");
      }
      setSnapshot(payload.snapshot);
      setMeta(payload.meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [selectedScenarioKind, selectedTerritoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runScenario = useCallback(
    async (kind: SimulatorScenarioKind) => {
      setSimulating(true);
      try {
        const response = await fetchWithTimeout("/api/coverage-optimization-simulator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario: kind,
            territoryId: selectedTerritoryId || undefined,
          }),
          timeoutMs: FETCH_T4_INTELLIGENCE_MS,
        });
        const payload = (await response.json()) as SimulatorResponse & { scenario?: SimulatorScenarioResult };
        if (!response.ok || !payload.ok || !payload.snapshot) {
          throw new Error(payload.error ?? "Simulation failed");
        }
        setSnapshot(payload.snapshot);
        setMeta(payload.meta);
        setSelectedScenarioKind(kind);
      } catch {
        // Keep current snapshot visible.
      } finally {
        setSimulating(false);
      }
    },
    [selectedTerritoryId],
  );

  const dataTrust = {
    hasData: Boolean(snapshot),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  const activeScenario =
    snapshot?.scenarios.find((row) => row.id === snapshot.activeScenarioId) ??
    snapshot?.scenarios[0] ??
    null;

  const content = snapshot ? (
    <div id="coverage-optimization-simulator" className={compact ? "space-y-3" : UI_SPACE.page}>
      {!compact ? (
        <div className={UI_LAYOUT.pageHeader}>
          <div>
            <h2 className={UI_TYPE.pageTitle}>Coverage Optimization Simulator</h2>
            <p className={UI_TYPE.pageSubtitle}>
              Test recruiting decisions before taking action — coverage, hires, and risk impact
            </p>
          </div>
          <div className={UI_LAYOUT.toolbar}>
            <DataTrustBadge trust={dataTrust} />
            {meta?.intelligenceCache ? (
              <span className="rounded-full border border-zinc-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Intel cache · {meta.intelligenceCache.cacheStatus}
              </span>
            ) : null}
            <button type="button" onClick={() => void load()} className={UI_BUTTON.primary} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
        <KpiCard label="Coverage" value={snapshot.baseline.coveragePercent} suffix="%" />
        <KpiCard
          label="Optimized Coverage"
          value={snapshot.forecastComparison.optimizedForecast.coveragePercent}
          suffix="%"
        />
        <KpiCard
          label="Candidate Gain"
          value={snapshot.forecastComparison.candidateImprovement}
        />
        <KpiCard label="Hire Gain" value={snapshot.forecastComparison.hiringImprovement} />
      </div>

      <div className={`grid gap-4 ${compact ? "" : "xl:grid-cols-3"}`}>
        <SectionCard title="Territory Simulator" subtitle="Select territory to scope projections">
          <div className="space-y-2">
            <select
              value={selectedTerritoryId}
              onChange={(event) => setSelectedTerritoryId(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">All scoped territories</option>
              {snapshot.territoryOptions.map((option) => (
                <option key={option.entityId} value={option.entityId}>
                  {option.label} · {option.openCalls} open · risk {option.riskScore}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {SCENARIO_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  disabled={simulating}
                  onClick={() => void runScenario(option.kind)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selectedScenarioKind === option.kind
                      ? "border-teal-500/50 bg-teal-500/15 text-teal-100"
                      : "border-zinc-700 text-zinc-300 hover:border-teal-500/30"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Coverage Impact"
          subtitle="Current vs projected state"
        >
          {activeScenario ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <ImpactDelta
                label="Candidates"
                value={activeScenario.impact.difference.additionalCandidates}
              />
              <ImpactDelta label="Hires" value={activeScenario.impact.difference.additionalHires} />
              <ImpactDelta
                label="Coverage"
                value={activeScenario.impact.difference.coveragePercent}
                suffix="%"
              />
              <ImpactDelta
                label="Open Calls"
                value={-activeScenario.impact.difference.openCallsReduced}
              />
              <ImpactDelta
                label="Risk Reduction"
                value={activeScenario.impact.difference.riskReduction}
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Select a scenario to view impact.</p>
          )}
        </SectionCard>

        <SectionCard title="Best Actions" subtitle="Highest ROI with confidence range">
          {snapshot.optimizationSuggestions.length === 0 ? (
            <p className="text-sm text-zinc-500">No optimization suggestions yet.</p>
          ) : (
            <div className="space-y-2">
              {snapshot.optimizationSuggestions.map((suggestion) => (
                <div
                  key={suggestion.rank}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
                >
                  <p className="text-sm font-medium text-zinc-50">
                    #{suggestion.rank} {suggestion.scenario.label}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    ROI {suggestion.expectedRoiScore} · {suggestion.confidenceScore}% confidence (
                    {suggestion.scenario.confidenceLow}–{suggestion.scenario.confidenceHigh})
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {!compact ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Top 10 ROI Scenarios" subtitle="Executive planning view">
            <div className="space-y-2">
              {snapshot.topRoiScenarios.map((scenario) => (
                <ScenarioRow
                  key={scenario.id}
                  scenario={scenario}
                  active={scenario.id === snapshot.activeScenarioId}
                  onSelect={() => void runScenario(scenario.kind)}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Recommendation Testing" subtitle="Expected vs simulated P29 impact">
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {snapshot.recommendationTests.length === 0 ? (
                <p className="text-sm text-zinc-500">No recommendations to test.</p>
              ) : (
                snapshot.recommendationTests.slice(0, 12).map((test) => (
                  <div
                    key={test.recommendationId}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-zinc-100">{test.recommendationTitle}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {test.entityLabel} · alignment {test.alignmentScore}% · confidence{" "}
                      {test.confidenceLow}–{test.confidenceHigh}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Expected +{test.expectedImpact.additionalCandidates} candidates / simulated +
                      {test.simulatedImpact.additionalCandidates}
                    </p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Resource Allocation" subtitle="Moving recruiters, budget, and priorities">
            <div className="space-y-2">
              {snapshot.resourceAllocations.map((allocation) => (
                <div
                  key={allocation.id}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-zinc-100">{allocation.label}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    ROI {allocation.expectedRoiScore} · {allocation.confidenceScore}% confidence
                    {allocation.fromLabel ? ` · ${allocation.fromLabel} → ${allocation.toLabel}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    +{allocation.impact.difference.coveragePercent}% coverage · +
                    {allocation.impact.difference.additionalHires} hires
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Forecast Comparison" subtitle="Current vs optimized forecast">
            <div className="grid gap-2 sm:grid-cols-2">
              <ImpactDelta
                label="Coverage Improvement"
                value={snapshot.forecastComparison.coverageImprovement}
                suffix="%"
              />
              <ImpactDelta
                label="Candidate Improvement"
                value={snapshot.forecastComparison.candidateImprovement}
              />
              <ImpactDelta
                label="Hiring Improvement"
                value={snapshot.forecastComparison.hiringImprovement}
              />
              <ImpactDelta
                label="Risk Reduction"
                value={snapshot.forecastComparison.riskReduction}
              />
            </div>
          </SectionCard>
        </div>
      ) : (
        <div className="space-y-2">
          {snapshot.topRoiScenarios.slice(0, 5).map((scenario) => (
            <ScenarioRow
              key={scenario.id}
              scenario={scenario}
              active={scenario.id === snapshot.activeScenarioId}
              onSelect={() => void runScenario(scenario.kind)}
            />
          ))}
        </div>
      )}
    </div>
  ) : null;

  if (compact) {
    if (loading && !snapshot) {
      return <p className="text-sm text-zinc-500">Loading simulator…</p>;
    }
    if (error && !snapshot) {
      return <p className="text-sm text-red-300">{error}</p>;
    }
    return content;
  }

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading coverage optimization simulator…"
      emptyTitle="No simulator data yet"
      emptyMessage="Scenarios will appear after the next successful intelligence sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(snapshot)}
    >
      {content}
    </WorkspacePageShell>
  );
}
