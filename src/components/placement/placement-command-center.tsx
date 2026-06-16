"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import {
  clearPlacementAlertContext,
  readPlacementAlertContext,
} from "@/lib/alerts/placement-alert-navigation";
import {
  exportDmCoverageReportCsv,
  exportExecutivePlacementReportCsv,
  exportProjectFillForecastCsv,
  exportRecruiterPlacementReportCsv,
  type ConversionSegmentRow,
  type PlacementCommandCenterSnapshot,
  type PlacementCoverageRisk,
  type ProjectFillOutcome,
} from "@/lib/placement-command-center";
import {
  UI_BUTTON,
  UI_INPUT,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PlacementResponse = {
  ok?: boolean;
  center?: PlacementCommandCenterSnapshot;
  meta?: { partialSync?: boolean; hasMelData?: boolean; refreshedAt?: string };
  error?: string;
};

type ConversionTab = "recruiter" | "dm" | "project" | "state";
type ForecastFilter = "all" | "critical" | "at-risk" | "likely-to-fill";
type CoverageRiskFilter = "all" | PlacementCoverageRisk;

const TABLE_PREVIEW_LIMIT = 75;

const FORECAST_SORT: Record<ProjectFillOutcome, number> = {
  critical: 0,
  "at-risk": 1,
  "likely-to-fill": 2,
};

const COVERAGE_RISK_STYLES: Record<PlacementCoverageRisk, string> = {
  green: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
  yellow: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  red: "border-red-500/40 bg-red-500/15 text-red-100",
};

const COVERAGE_ROW_BG: Record<PlacementCoverageRisk, string> = {
  green: "bg-emerald-500/5",
  yellow: "bg-amber-500/6",
  red: "bg-red-500/8",
};

const FORECAST_CHIP: Record<ProjectFillOutcome, string> = {
  "likely-to-fill": "bg-emerald-500/15 text-emerald-100",
  "at-risk": "bg-amber-500/15 text-amber-100",
  critical: "bg-red-500/15 text-red-100",
};

const SEVERITY_CHIP: Record<"critical" | "high" | "medium", string> = {
  critical: "bg-red-500/15 text-red-100 border-red-500/40",
  high: "bg-amber-500/15 text-amber-100 border-amber-500/40",
  medium: "bg-sky-500/15 text-sky-100 border-sky-500/40",
};

function trendLabel(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function scrollToSection(elementId: string): void {
  document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function TablePreviewFooter({
  total,
  shown,
  onShowAll,
}: {
  total: number;
  shown: number;
  onShowAll: () => void;
}) {
  if (total <= shown) return null;
  return (
    <div className="border-t border-zinc-800/80 px-3 py-2 text-center">
      <button type="button" onClick={onShowAll} className={UI_BUTTON.ghost}>
        Show all {total} rows ({total - shown} hidden)
      </button>
    </div>
  );
}

function formatPercent(value: number | null): string {
  return value != null ? `${value}%` : "—";
}

function ConversionTable({ rows }: { rows: ConversionSegmentRow[] }) {
  if (rows.length === 0) {
    return (
      <WorkspaceEmptyState
        title="No conversion data"
        message="Conversion analytics will appear when pipeline segments have enough volume."
        nextStep="Check back after more candidates progress through the funnel."
      />
    );
  }
  return (
    <div className={UI_SURFACE.tableWrap}>
      <table className={UI_LAYOUT.responsiveTable}>
        <thead className={UI_TYPE.tableHead}>
          <tr>
            <th className="px-3 py-2">Segment</th>
            <th className="px-3 py-2">App → Contact</th>
            <th className="px-3 py-2">Contact → Paperwork</th>
            <th className="px-3 py-2">Paperwork → Signed</th>
            <th className="px-3 py-2">Signed → MEL</th>
            <th className="px-3 py-2">MEL → 1st Project</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
          {rows.map((row) => (
            <tr key={row.segmentKey}>
              <td className="px-3 py-2 font-medium">{row.segmentLabel}</td>
              <td className="px-3 py-2">{formatPercent(row.applicationToContact)}</td>
              <td className="px-3 py-2">{formatPercent(row.contactToPaperwork)}</td>
              <td className="px-3 py-2">{formatPercent(row.paperworkToSigned)}</td>
              <td className="px-3 py-2">{formatPercent(row.signedToMel)}</td>
              <td className="px-3 py-2">{formatPercent(row.melToFirstProject)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardroomMode({
  center,
  onExit,
}: {
  center: PlacementCommandCenterSnapshot;
  onExit: () => void;
}) {
  const criticalBoard = center.executiveBoard.filter((row) => row.severity === "red").slice(0, 6);
  const topFunnel = center.funnel.slice(0, 5);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950 px-6 py-8 text-zinc-50 sm:px-10 lg:px-14">
      <div className={`mx-auto flex max-w-7xl flex-col gap-8 ${UI_SPACE.page}`}>
        <div className={UI_LAYOUT.pageHeader}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
              Boardroom Mode
            </p>
            <h1 className={`mt-2 ${UI_TYPE.boardroomTitle}`}>Placement Command Center</h1>
            <p className="mt-2 text-base text-zinc-400">
              Placement funnel, coverage, and fill forecasts — leadership snapshot.
            </p>
          </div>
          <button type="button" onClick={onExit} className={UI_BUTTON.boardroom}>
            Exit
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Open Calls</p>
            <p className={`mt-2 ${UI_TYPE.boardroomKpi}`}>{center.summary.totalOpenCalls}</p>
          </section>
          <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Avg Coverage</p>
            <p className={`mt-2 ${UI_TYPE.boardroomKpi}`}>{center.summary.avgCoveragePercent}%</p>
          </section>
          <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Placements (30d)</p>
            <p className={`mt-2 ${UI_TYPE.boardroomKpi}`}>{center.summary.placements30d}</p>
          </section>
          <section className={`${UI_SURFACE.panel} border-red-500/30 bg-red-500/10 p-6`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-red-200/80">Critical Projects</p>
            <p className={`mt-2 ${UI_TYPE.boardroomKpi}`}>{center.summary.criticalProjects}</p>
          </section>
        </div>

        <div className={UI_LAYOUT.boardroomGrid}>
          <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
            <h2 className={UI_TYPE.boardroomSection}>Placement Funnel</h2>
            <ul className="mt-4 space-y-3">
              {topFunnel.map((stage) => (
                <li key={stage.id} className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-lg sm:text-xl">{stage.label}</span>
                  <span className="text-3xl font-bold tabular-nums sm:text-4xl">
                    {stage.count} {trendLabel(stage.trend)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
            <h2 className={UI_TYPE.boardroomSection}>Executive Placement Board</h2>
            <ul className="mt-4 space-y-3">
              {criticalBoard.length === 0 ? (
                <li className="text-zinc-400">No critical placement risks flagged.</li>
              ) : (
                criticalBoard.map((row) => (
                  <li key={row.id} className="border-b border-zinc-800 pb-3">
                    <p className="text-lg font-medium sm:text-xl">{row.label}</p>
                    <p className="text-teal-200/90">{row.detail}</p>
                    <p className="text-zinc-400">{row.metric}</p>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
          <h2 className={UI_TYPE.boardroomSection}>Project Fill Forecast</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["critical", "at-risk", "likely-to-fill"] as const).map((outcome) => {
              const count = center.projectForecasts.filter((row) => row.outcome === outcome).length;
              return (
                <div key={outcome} className={`rounded-xl border px-4 py-3 ${FORECAST_CHIP[outcome]}`}>
                  <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
                    {outcome.replace(/-/g, " ")}
                  </p>
                  <p className="text-4xl font-bold tabular-nums sm:text-5xl">{count}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

export function PlacementCommandCenter() {
  const [center, setCenter] = useState<PlacementCommandCenterSnapshot | null>(null);
  const [meta, setMeta] = useState<PlacementResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [boardroom, setBoardroom] = useState(false);
  const [conversionTab, setConversionTab] = useState<ConversionTab>("recruiter");
  const [forecastFilter, setForecastFilter] = useState<ForecastFilter>("all");
  const [coverageRiskFilter, setCoverageRiskFilter] = useState<CoverageRiskFilter>("all");
  const [zeroPipelineOnly, setZeroPipelineOnly] = useState(false);
  const [storeCoverageExpanded, setStoreCoverageExpanded] = useState(false);
  const [forecastsExpanded, setForecastsExpanded] = useState(false);
  const hasLoadedRef = useRef(false);
  const placementContextAppliedRef = useRef(false);

  const load = useCallback(async () => {
    if (hasLoadedRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/placement-command-center", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as PlacementResponse;
      if (!response.ok || !payload.ok || !payload.center) {
        throw new Error(payload.error ?? "Failed to load placement command center");
      }
      setCenter(payload.center);
      setMeta(payload.meta);
      hasLoadedRef.current = true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!center || placementContextAppliedRef.current) return;
    const context = readPlacementAlertContext();
    if (!context) return;
    placementContextAppliedRef.current = true;

    if (context.forecastFilter && context.forecastFilter !== "all") {
      setForecastFilter(context.forecastFilter);
    }
    if (context.zeroPipelineOnly) {
      setZeroPipelineOnly(true);
    }
    if (context.highlightSection === "forecasts") {
      setForecastsExpanded(true);
      window.setTimeout(() => scrollToSection("placement-project-forecasts"), 150);
    } else if (context.highlightSection === "recovery") {
      window.setTimeout(() => scrollToSection("placement-open-call-recovery"), 150);
    } else {
      setStoreCoverageExpanded(true);
      window.setTimeout(() => scrollToSection("placement-store-coverage"), 150);
    }
    clearPlacementAlertContext();
  }, [center]);

  useEffect(() => {
    if (!boardroom) return;
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [boardroom, load]);

  const dataTrust = {
    hasData: Boolean(center),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  const conversionRows =
    center == null
      ? []
      : conversionTab === "recruiter"
        ? center.conversionByRecruiter
        : conversionTab === "dm"
          ? center.conversionByDm
          : conversionTab === "project"
            ? center.conversionByProject
            : center.conversionByState;

  const filteredStoreCoverage = useMemo(() => {
    if (!center) return [];
    return center.storeCoverage.filter((row) => {
      if (coverageRiskFilter !== "all" && row.risk !== coverageRiskFilter) return false;
      if (zeroPipelineOnly && row.candidatesInPipeline > 0) return false;
      return true;
    });
  }, [center, coverageRiskFilter, zeroPipelineOnly]);

  const sortedForecasts = useMemo(() => {
    if (!center) return [];
    const rows = [...center.projectForecasts].sort(
      (a, b) => FORECAST_SORT[a.outcome] - FORECAST_SORT[b.outcome],
    );
    if (forecastFilter === "all") return rows;
    return rows.filter((row) => row.outcome === forecastFilter);
  }, [center, forecastFilter]);

  const visibleStoreCoverage = storeCoverageExpanded
    ? filteredStoreCoverage
    : filteredStoreCoverage.slice(0, TABLE_PREVIEW_LIMIT);
  const visibleForecasts = forecastsExpanded
    ? sortedForecasts
    : sortedForecasts.slice(0, TABLE_PREVIEW_LIMIT);

  const executiveAnswers = center
    ? [
        {
          label: "Projects at risk",
          value: center.projectForecasts.filter((row) => row.outcome === "critical").length,
          tone: "critical" as const,
          onClick: () => {
            setForecastFilter("critical");
            setForecastsExpanded(true);
            scrollToSection("placement-project-forecasts");
          },
        },
        {
          label: "Stores with no pipeline",
          value: center.storeCoverage.filter((row) => row.candidatesInPipeline === 0 && row.openCalls > 0)
            .length,
          tone: "warn" as const,
          onClick: () => {
            setZeroPipelineOnly(true);
            setCoverageRiskFilter("all");
            setStoreCoverageExpanded(true);
            scrollToSection("placement-store-coverage");
          },
        },
        {
          label: "Top recruiter placements",
          value: center.recruiterScorecard[0]?.placements ?? 0,
          detail: center.recruiterScorecard[0]?.recruiterName,
          tone: "ok" as const,
          onClick: () => scrollToSection("placement-recruiter-scorecard"),
        },
        {
          label: "DMs with coverage gaps",
          value: center.dmScorecard.filter((row) => row.coveragePercent < 70).length,
          tone: "warn" as const,
          onClick: () => scrollToSection("placement-dm-scorecard"),
        },
        {
          label: "Likely to miss",
          value: center.projectForecasts.filter(
            (row) => row.outcome === "critical" || row.outcome === "at-risk",
          ).length,
          tone: "critical" as const,
          onClick: () => {
            setForecastFilter("all");
            scrollToSection("placement-project-forecasts");
          },
        },
      ]
    : [];

  if (boardroom && center) {
    return <BoardroomMode center={center} onExit={() => setBoardroom(false)} />;
  }

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(center)}
      loadingMessage="Loading placement command center…"
      emptyTitle="No placement data yet"
      emptyMessage="Placement analytics will appear after the next successful sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy in Admin."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(center)}
    >
      {center ? (
        <div id="placement-command-center" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Placement Command Center</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Funnel, store coverage, fill forecasts, and placement scorecards.
              </p>
            </div>
            <div className={UI_LAYOUT.toolbar}>
              <DataTrustBadge trust={dataTrust} />
              {refreshing ? (
                <span className="text-xs text-zinc-500">Refreshing…</span>
              ) : null}
              <button type="button" onClick={() => setBoardroom(true)} className={UI_BUTTON.primary}>
                Boardroom Mode
              </button>
              <button type="button" onClick={() => void load()} className={UI_BUTTON.ghost} disabled={refreshing}>
                Refresh
              </button>
            </div>
          </div>

          <section className={UI_SPACE.section} aria-label="Executive quick answers">
            <h3 className={UI_TYPE.sectionTitle}>Leadership quick answers</h3>
            <p className="mt-1 text-xs text-zinc-500">
              One click to the data behind each executive question.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {executiveAnswers.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors hover:border-teal-500/35 ${
                    item.tone === "critical"
                      ? "border-red-500/35 bg-red-500/8"
                      : item.tone === "warn"
                        ? "border-amber-500/35 bg-amber-500/8"
                        : "border-zinc-800/80 bg-zinc-950/50"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">{item.value}</p>
                  {item.detail ? (
                    <p className="mt-0.5 truncate text-xs text-zinc-400">{item.detail}</p>
                  ) : null}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Open Calls", value: center.summary.totalOpenCalls },
              { label: "Avg Coverage", value: `${center.summary.avgCoveragePercent}%` },
              { label: "Placements (30d)", value: center.summary.placements30d },
              {
                label: "Critical Projects",
                value: center.summary.criticalProjects,
                tone: center.summary.criticalProjects > 0 ? "critical" : undefined,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-xl border p-4 ${
                  kpi.tone === "critical"
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-zinc-800/80 bg-zinc-950/50"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  {kpi.label}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-50">{kpi.value}</p>
              </div>
            ))}
          </section>

          <section className={UI_SPACE.section}>
            <h3 className={UI_TYPE.sectionTitle}>Placement funnel</h3>
            {center.funnel.length === 0 ? (
              <WorkspaceEmptyState
                title="No funnel stages"
                message="Candidate pipeline stages will populate from Breezy and workflow data."
                onRefresh={() => void load()}
              />
            ) : (
              <div className={UI_SURFACE.tableWrap}>
                <table className={UI_LAYOUT.responsiveTable}>
                  <thead className={UI_TYPE.tableHead}>
                    <tr>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Count</th>
                      <th className="px-3 py-2">Conversion</th>
                      <th className="px-3 py-2">Drop-off</th>
                      <th className="px-3 py-2">Avg Days</th>
                      <th className="px-3 py-2">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                    {center.funnel.map((stage) => (
                      <tr key={stage.id}>
                        <td className="px-3 py-2 font-medium">{stage.label}</td>
                        <td className="px-3 py-2">{stage.count}</td>
                        <td className="px-3 py-2">{formatPercent(stage.conversionPercent)}</td>
                        <td className="px-3 py-2">{formatPercent(stage.dropOffPercent)}</td>
                        <td className="px-3 py-2">
                          {stage.avgDaysInStage != null ? stage.avgDaysInStage : "—"}
                        </td>
                        <td className="px-3 py-2">{trendLabel(stage.trend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={UI_SPACE.section} id="placement-store-coverage">
            <div className={UI_LAYOUT.pageHeader}>
              <h3 className={UI_TYPE.sectionTitle}>Store coverage</h3>
              <div className={`${UI_LAYOUT.toolbar} ${UI_INPUT.filterBar}`}>
                <select
                  value={coverageRiskFilter}
                  onChange={(event) =>
                    setCoverageRiskFilter(event.target.value as CoverageRiskFilter)
                  }
                  className={UI_INPUT.select}
                  aria-label="Filter by coverage risk"
                >
                  <option value="all">All risks</option>
                  <option value="red">Critical</option>
                  <option value="yellow">At risk</option>
                  <option value="green">Healthy</option>
                </select>
                <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={zeroPipelineOnly}
                    onChange={(event) => setZeroPipelineOnly(event.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-900"
                  />
                  Zero pipeline only
                </label>
              </div>
            </div>
            {center.storeCoverage.length === 0 ? (
              <WorkspaceEmptyState
                title="No store coverage rows"
                message="MEL opportunities and candidate assignments drive store coverage metrics."
                nextStep="Confirm MEL projects sheet is synced."
                onRefresh={() => void load()}
              />
            ) : filteredStoreCoverage.length === 0 ? (
              <WorkspaceEmptyState
                title="No stores match filters"
                message="Try clearing risk filters or the zero-pipeline toggle."
                onRefresh={() => {
                  setCoverageRiskFilter("all");
                  setZeroPipelineOnly(false);
                }}
              />
            ) : (
              <div className={UI_SURFACE.tableWrap}>
                <table className={UI_LAYOUT.responsiveTable}>
                  <thead className={UI_TYPE.tableHead}>
                    <tr>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2">Project</th>
                      <th className="px-3 py-2">Open</th>
                      <th className="px-3 py-2">Assigned</th>
                      <th className="px-3 py-2">Pipeline</th>
                      <th className="px-3 py-2">Coverage</th>
                      <th className="px-3 py-2">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                    {visibleStoreCoverage.map((row) => (
                      <tr key={row.opportunityId} className={COVERAGE_ROW_BG[row.risk]}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{row.store}</p>
                          <p className="text-xs text-zinc-500">{row.client}</p>
                        </td>
                        <td className="px-3 py-2">{row.project}</td>
                        <td className="px-3 py-2">{row.openCalls}</td>
                        <td className="px-3 py-2">{row.candidatesAssigned}</td>
                        <td className="px-3 py-2">{row.candidatesInPipeline}</td>
                        <td className="px-3 py-2">{row.coveragePercent}%</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${COVERAGE_RISK_STYLES[row.risk]}`}
                          >
                            {row.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TablePreviewFooter
                  total={filteredStoreCoverage.length}
                  shown={visibleStoreCoverage.length}
                  onShowAll={() => setStoreCoverageExpanded(true)}
                />
              </div>
            )}
          </section>

          <section className={UI_SPACE.section} id="placement-project-forecasts">
            <div className={UI_LAYOUT.pageHeader}>
              <h3 className={UI_TYPE.sectionTitle}>Project fill forecasts</h3>
              <div className={`${UI_LAYOUT.toolbar} ${UI_INPUT.filterBar}`}>
                <select
                  value={forecastFilter}
                  onChange={(event) => setForecastFilter(event.target.value as ForecastFilter)}
                  className={UI_INPUT.select}
                  aria-label="Filter forecast outcome"
                >
                  <option value="all">All outcomes</option>
                  <option value="critical">Critical</option>
                  <option value="at-risk">At risk</option>
                  <option value="likely-to-fill">Likely to fill</option>
                </select>
                <button
                  type="button"
                  onClick={() => exportProjectFillForecastCsv(center)}
                  className={UI_BUTTON.ghost}
                >
                  Export forecasts
                </button>
              </div>
            </div>
            {center.projectForecasts.length === 0 ? (
              <WorkspaceEmptyState
                title="No fill forecasts"
                message="Project fill projections require MEL opportunities and pipeline data."
                onRefresh={() => void load()}
              />
            ) : sortedForecasts.length === 0 ? (
              <WorkspaceEmptyState
                title="No forecasts match filter"
                message="Try selecting a different outcome filter."
                onRefresh={() => setForecastFilter("all")}
              />
            ) : (
              <div className={UI_SURFACE.tableWrap}>
                <table className={UI_LAYOUT.responsiveTable}>
                  <thead className={UI_TYPE.tableHead}>
                    <tr>
                      <th className="px-3 py-2">Project</th>
                      <th className="px-3 py-2">Current Fill</th>
                      <th className="px-3 py-2">Required</th>
                      <th className="px-3 py-2">Outcome</th>
                      <th className="px-3 py-2">Confidence</th>
                      <th className="px-3 py-2">Finish Date</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                    {visibleForecasts.map((row) => (
                      <tr key={row.opportunityId}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{row.projectName}</p>
                          <p className="text-xs text-zinc-500">{row.client}</p>
                        </td>
                        <td className="px-3 py-2">{row.currentFillRatePercent}%</td>
                        <td className="px-3 py-2">{row.requiredFillRatePercent}%</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${FORECAST_CHIP[row.outcome]}`}
                          >
                            {row.outcome.replace(/-/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2">{row.confidenceScore}%</td>
                        <td className="px-3 py-2 text-xs">{row.projectedFinishDate ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-zinc-400">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TablePreviewFooter
                  total={sortedForecasts.length}
                  shown={visibleForecasts.length}
                  onShowAll={() => setForecastsExpanded(true)}
                />
              </div>
            )}
          </section>

          <section className={UI_SPACE.section} id="placement-conversion-analytics">
            <div className={UI_LAYOUT.pageHeader}>
              <h3 className={UI_TYPE.sectionTitle}>Conversion analytics</h3>
              <div className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-0.5">
                {(
                  [
                    ["recruiter", "By recruiter"],
                    ["dm", "By DM"],
                    ["project", "By project"],
                    ["state", "By state"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setConversionTab(id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      conversionTab === id ? "bg-teal-600/25 text-teal-100" : "text-zinc-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ConversionTable rows={conversionRows} />
          </section>

          <section className={UI_SPACE.section} id="placement-recruiter-scorecard">
            <div className={UI_LAYOUT.pageHeader}>
              <h3 className={UI_TYPE.sectionTitle}>Recruiter placement scorecard</h3>
              <button
                type="button"
                onClick={() => exportRecruiterPlacementReportCsv(center)}
                className={UI_BUTTON.ghost}
              >
                Export recruiters
              </button>
            </div>
            {center.recruiterScorecard.length === 0 ? (
              <WorkspaceEmptyState
                title="No recruiter scorecard"
                message="Recruiter placement metrics appear when candidates are assigned and placed."
                onRefresh={() => void load()}
              />
            ) : (
              <div className={UI_SURFACE.tableWrap}>
                <table className={UI_LAYOUT.responsiveTable}>
                  <thead className={UI_TYPE.tableHead}>
                    <tr>
                      <th className="px-3 py-2">Recruiter</th>
                      <th className="px-3 py-2">Placements</th>
                      <th className="px-3 py-2">Conversion</th>
                      <th className="px-3 py-2">Avg Days</th>
                      <th className="px-3 py-2">MEL Ready</th>
                      <th className="px-3 py-2">Completions</th>
                      <th className="px-3 py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                    {center.recruiterScorecard.map((row) => (
                      <tr key={row.recruiterName}>
                        <td className="px-3 py-2 font-medium">{row.recruiterName}</td>
                        <td className="px-3 py-2">{row.placements}</td>
                        <td className="px-3 py-2">{row.conversionRatePercent}%</td>
                        <td className="px-3 py-2">
                          {row.avgTimeToPlacementDays != null ? row.avgTimeToPlacementDays : "—"}
                        </td>
                        <td className="px-3 py-2">{row.melReadyCount}</td>
                        <td className="px-3 py-2">{row.projectCompletions}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums">{row.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={UI_SPACE.section} id="placement-dm-scorecard">
            <div className={UI_LAYOUT.pageHeader}>
              <h3 className={UI_TYPE.sectionTitle}>DM coverage scorecard</h3>
              <button
                type="button"
                onClick={() => exportDmCoverageReportCsv(center)}
                className={UI_BUTTON.ghost}
              >
                Export DMs
              </button>
            </div>
            {center.dmScorecard.length === 0 ? (
              <WorkspaceEmptyState
                title="No DM scorecard"
                message="DM coverage metrics require territory assignments and open call data."
                onRefresh={() => void load()}
              />
            ) : (
              <div className={UI_SURFACE.tableWrap}>
                <table className={UI_LAYOUT.responsiveTable}>
                  <thead className={UI_TYPE.tableHead}>
                    <tr>
                      <th className="px-3 py-2">DM</th>
                      <th className="px-3 py-2">Coverage</th>
                      <th className="px-3 py-2">Rep Utilization</th>
                      <th className="px-3 py-2">Velocity</th>
                      <th className="px-3 py-2">Open Call Reduction</th>
                      <th className="px-3 py-2">Open Calls</th>
                      <th className="px-3 py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                    {center.dmScorecard.map((row) => (
                      <tr key={row.dmName}>
                        <td className="px-3 py-2 font-medium">{row.dmName}</td>
                        <td className="px-3 py-2">{row.coveragePercent}%</td>
                        <td className="px-3 py-2">{row.repUtilizationPercent}%</td>
                        <td className="px-3 py-2">{row.placementVelocity}</td>
                        <td className="px-3 py-2">{row.openCallReduction}</td>
                        <td className="px-3 py-2">{row.openCalls}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums">{row.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={UI_SPACE.section} id="placement-open-call-recovery">
            <h3 className={UI_TYPE.sectionTitle}>Open call recovery</h3>
            {center.openCallRecovery.length === 0 ? (
              <WorkspaceEmptyState
                title="No recovery actions"
                message="Open call recovery recommendations appear when stores have coverage gaps."
                nextStep="Review store coverage table for at-risk locations."
              />
            ) : (
              <ul className={UI_SPACE.stackSm}>
                {center.openCallRecovery.map((action) => (
                  <li
                    key={action.id}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-50">
                          {action.store} · {action.project}
                        </p>
                        <p className="text-xs text-zinc-500">{action.client}</p>
                        <p className="mt-1 text-sm text-zinc-300">{action.issue}</p>
                        <p className="mt-1 text-xs text-teal-200/90">{action.suggestedAction}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_CHIP[action.severity]}`}
                      >
                        {action.severity}
                        {action.agingDays != null ? ` · ${action.agingDays}d` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={UI_SPACE.section} id="placement-executive-board">
            <div className={UI_LAYOUT.pageHeader}>
              <h3 className={UI_TYPE.sectionTitle}>Executive placement board</h3>
              <button
                type="button"
                onClick={() => exportExecutivePlacementReportCsv(center)}
                className={UI_BUTTON.ghost}
              >
                Export board
              </button>
            </div>
            {center.executiveBoard.length === 0 ? (
              <WorkspaceEmptyState
                title="No executive board items"
                message="Leadership placement highlights will surface from coverage and funnel signals."
                onRefresh={() => void load()}
              />
            ) : (
              <ul className={UI_SPACE.stackSm}>
                {center.executiveBoard.map((row) => (
                  <li
                    key={row.id}
                    className={`rounded-xl border px-4 py-3 ${COVERAGE_RISK_STYLES[row.severity]}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                          {row.category.replace(/-/g, " ")}
                        </p>
                        <p className="mt-1 text-sm font-semibold">{row.label}</p>
                        <p className="mt-0.5 text-xs opacity-90">{row.detail}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums">{row.metric}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
