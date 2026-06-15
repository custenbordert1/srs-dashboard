"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import {
  exportExecutiveActionBoardCsv,
  exportExecutiveProjectsCsv,
  exportExecutiveRecruitersCsv,
  exportExecutiveTerritoriesCsv,
  filterProjectWarRoomRows,
  projectWarRoomFilterOptions,
  type ExecutiveOperationsCenterSnapshot,
  type ExecutiveProjectWarRoomRow,
  type ExecutiveRecruiterWarRoomRow,
  type ExecutiveTerritoryWarRoomRow,
} from "@/lib/executive-operations-center";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import type { CompanyHealthTier, ProjectForecastOutcome } from "@/lib/executive-operations-center/types";
import type { ActionRecommendationCard } from "@/lib/territory-action-engine";
import type { ProjectRiskLevel } from "@/lib/territory-action-engine/types";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_INPUT,
  UI_LAYOUT,
  UI_RISK,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useMemo, useState } from "react";

type OpsResponse = {
  ok?: boolean;
  center?: ExecutiveOperationsCenterSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
  };
  error?: string;
};

type DrillDown =
  | { kind: "project"; row: ExecutiveProjectWarRoomRow }
  | { kind: "territory"; row: ExecutiveTerritoryWarRoomRow }
  | { kind: "recruiter"; row: ExecutiveRecruiterWarRoomRow }
  | { kind: "action"; row: ActionRecommendationCard }
  | null;

type WarRoomTab = "projects" | "territories" | "recruiters";

const HEALTH_TIER_STYLES: Record<CompanyHealthTier, string> = {
  critical: UI_RISK.critical,
  "at-risk": UI_RISK.atRisk,
  stable: UI_RISK.stable,
  healthy: UI_RISK.healthy,
};

const TERRITORY_TIER_ROW: Record<CompanyHealthTier, string> = {
  critical: "bg-red-500/8",
  "at-risk": "bg-amber-500/6",
  stable: "",
  healthy: "bg-emerald-500/5",
};

const RISK_CHIP: Record<ProjectRiskLevel, string> = {
  critical: UI_BADGE.critical,
  high: UI_BADGE.high,
  moderate: UI_BADGE.moderate,
  healthy: UI_BADGE.healthy,
};

const FORECAST_CHIP: Record<ProjectForecastOutcome, string> = {
  "likely-to-finish": "bg-emerald-500/15 text-emerald-100",
  "at-risk": "bg-amber-500/15 text-amber-100",
  "likely-to-miss": "bg-red-500/15 text-red-100",
};

function trendLabel(trend: ExecutiveOperationsCenterSnapshot["companyHealth"]["trend"]): string {
  if (trend === "up") return "↑ Improving";
  if (trend === "down") return "↓ Declining";
  return "→ Flat";
}

function ExecutiveDrillDownPanel({
  drillDown,
  onClose,
}: {
  drillDown: DrillDown;
  onClose: () => void;
}) {
  if (!drillDown) return null;
  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-700/80 bg-zinc-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-50">Executive drill-down</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm text-zinc-200">
        {drillDown.kind === "project" ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-zinc-50">{drillDown.row.projectName}</p>
            <p className="text-zinc-400">{drillDown.row.client} · {drillDown.row.state}</p>
            <p>Coverage: {drillDown.row.coveragePercent}%</p>
            <p>Applicants (state): {drillDown.row.applicantCount}</p>
            <p>Owner: {drillDown.row.owner}</p>
            <p className="text-teal-200">{drillDown.row.recommendation}</p>
          </div>
        ) : null}
        {drillDown.kind === "territory" ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-zinc-50">{drillDown.row.dmName}</p>
            <p className="text-zinc-400">{drillDown.row.states.join(", ")}</p>
            <p>Coverage: {drillDown.row.coveragePercent}%</p>
            <p>Open calls: {drillDown.row.openCalls}</p>
            <p>Rep pool: {drillDown.row.repPool}</p>
            <p>Risk score: {drillDown.row.riskScore}</p>
            <ul className="list-disc space-y-1 pl-4 text-teal-200/90">
              {drillDown.row.priorityActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {drillDown.kind === "recruiter" ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-zinc-50">{drillDown.row.recruiterName}</p>
            <p>Assigned: {drillDown.row.assignedCandidates}</p>
            <p>Follow-ups due: {drillDown.row.followUpsDue}</p>
            <p>Paperwork: {drillDown.row.paperwork}</p>
            <p>Ready for MEL: {drillDown.row.readyForMel}</p>
            <p>Status: {drillDown.row.status}</p>
            <p className="text-teal-200">{drillDown.row.recommendation}</p>
          </div>
        ) : null}
        {drillDown.kind === "action" ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-zinc-50">{drillDown.row.issue}</p>
            <p className="text-zinc-400">{drillDown.row.categoryLabel}</p>
            <p>{drillDown.row.impact}</p>
            <p>Owner: {drillDown.row.owner}</p>
            <p className="text-teal-200">{drillDown.row.suggestedAction}</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function BoardroomMode({
  center,
  onExit,
}: {
  center: ExecutiveOperationsCenterSnapshot;
  onExit: () => void;
}) {
  const topRisks = [
    center.riskSummaries.projectRisk,
    center.riskSummaries.territoryRisk,
    center.riskSummaries.recruiterRisk,
    center.riskSummaries.coverageRisk,
  ];

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950 px-6 py-8 text-zinc-50 sm:px-10 lg:px-14">
      <div className={`mx-auto flex max-w-7xl flex-col gap-8 ${UI_SPACE.page}`}>
        <div className={UI_LAYOUT.pageHeader}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
              Boardroom Mode
            </p>
            <h1 className={`mt-2 ${UI_TYPE.boardroomTitle}`}>Executive Operations Center</h1>
            <p className="mt-2 text-base text-zinc-400">
              Leadership snapshot — risks, actions, and forecast at a glance.
            </p>
          </div>
          <button type="button" onClick={onExit} className={UI_BUTTON.boardroom}>
            Exit
          </button>
        </div>

        <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-8 ${HEALTH_TIER_STYLES[center.companyHealth.tier]}`}>
          <p className="text-sm font-semibold uppercase tracking-wide opacity-80">Company Health</p>
          <p className={`mt-2 ${UI_TYPE.boardroomKpi}`}>{center.companyHealth.score}</p>
          <p className="mt-2 text-2xl capitalize sm:text-3xl">
            {center.companyHealth.tier.replace("-", " ")} · {trendLabel(center.companyHealth.trend)}
          </p>
        </section>

        <div className={UI_LAYOUT.boardroomGrid}>
          <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
            <h2 className={UI_TYPE.boardroomSection}>Top Risks</h2>
            <ul className="mt-4 space-y-4">
              {topRisks.map((risk) => (
                <li key={risk.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
                  <p className="text-xl font-medium sm:text-2xl">{risk.label}</p>
                  <p className="text-3xl font-bold tabular-nums text-amber-200 sm:text-4xl">{risk.count}</p>
                  <p className="text-zinc-400">{risk.topIssue}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
            <h2 className={UI_TYPE.boardroomSection}>Top Actions</h2>
            <ul className="mt-4 space-y-3">
              {center.actionBoard.slice(0, 8).map((action) => (
                <li key={action.id} className="border-b border-zinc-800 pb-3">
                  <p className="text-lg font-medium sm:text-xl">{action.issue}</p>
                  <p className="text-teal-200/90">{action.suggestedAction}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className={`${UI_SURFACE.panel} border-zinc-700 bg-zinc-900/60 p-6`}>
          <h2 className={UI_TYPE.boardroomSection}>Project Forecast</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["likely-to-miss", "at-risk", "likely-to-finish"] as const).map((outcome) => {
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

export function ExecutiveOperationsCenter() {
  const [center, setCenter] = useState<ExecutiveOperationsCenterSnapshot | null>(null);
  const [meta, setMeta] = useState<OpsResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [warRoomTab, setWarRoomTab] = useState<WarRoomTab>("projects");
  const [drillDown, setDrillDown] = useState<DrillDown>(null);
  const [boardroom, setBoardroom] = useState(false);
  const [projectClientFilter, setProjectClientFilter] = useState("all");
  const [projectDmFilter, setProjectDmFilter] = useState("all");
  const [projectStateFilter, setProjectStateFilter] = useState("all");
  const [projectRiskFilter, setProjectRiskFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/executive-operations-center", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as OpsResponse;
      if (!response.ok || !payload.ok || !payload.center) {
        throw new Error(payload.error ?? "Failed to load executive operations center");
      }
      setCenter(payload.center);
      setMeta(payload.meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!boardroom) return;
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [boardroom, load]);

  const projectFilters = useMemo(
    () => (center ? projectWarRoomFilterOptions(center.projectWarRoom) : { clients: [], dms: [], states: [] }),
    [center],
  );

  const filteredProjects = useMemo(() => {
    if (!center) return [];
    return filterProjectWarRoomRows(center.projectWarRoom, {
      client: projectClientFilter,
      dm: projectDmFilter,
      state: projectStateFilter,
      risk: projectRiskFilter,
    });
  }, [center, projectClientFilter, projectDmFilter, projectRiskFilter, projectStateFilter]);

  const dataTrust = {
    hasData: Boolean(center),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  if (boardroom && center) {
    return <BoardroomMode center={center} onExit={() => setBoardroom(false)} />;
  }

  const riskCards = center
    ? [
        center.riskSummaries.criticalActions,
        center.riskSummaries.projectRisk,
        center.riskSummaries.territoryRisk,
        center.riskSummaries.recruiterRisk,
        center.riskSummaries.coverageRisk,
      ]
    : [];

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(center)}
      loadingMessage="Loading operations center…"
      emptyTitle="No operations data yet"
      emptyMessage="Executive operations will appear after the next successful sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy in Admin."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(center)}
    >
      {center ? (
    <div id="executive-operations-center" className={UI_SPACE.page}>
      <div className={UI_LAYOUT.pageHeader}>
        <div>
          <h2 className={UI_TYPE.pageTitle}>Operations Center</h2>
          <p className={UI_TYPE.pageSubtitle}>
            Action-first leadership view — what needs intervention now.
          </p>
        </div>
        <div className={UI_LAYOUT.toolbar}>
          <DataTrustBadge trust={dataTrust} />
          {meta?.intelligenceCache ? (
            <span className="rounded-full border border-zinc-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Intel cache · {meta.intelligenceCache.cacheStatus} · {Math.round(meta.intelligenceCache.snapshotAgeMs / 1000)}s
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => navigateRecruitingTab({ tab: "placement-command-center" })}
            className={UI_BUTTON.ghost}
          >
            Placement Center
          </button>
          <button type="button" onClick={() => setBoardroom(true)} className={UI_BUTTON.primary}>
            Boardroom Mode
          </button>
          <button type="button" onClick={() => void load()} className={UI_BUTTON.ghost}>
            Refresh
          </button>
        </div>
      </div>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_2fr]">
        <div
          className={`rounded-2xl border p-5 ${HEALTH_TIER_STYLES[center.companyHealth.tier]}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Company Health</p>
          <p className="mt-2 text-5xl font-bold tabular-nums">{center.companyHealth.score}</p>
          <p className="mt-1 text-lg font-medium capitalize">
            {center.companyHealth.tier.replace("-", " ")}
          </p>
          <p className="mt-1 text-sm opacity-90">{trendLabel(center.companyHealth.trend)}</p>
          <ul className="mt-3 space-y-1 text-xs opacity-90">
            {center.companyHealth.drivers.map((driver) => (
              <li key={driver}>· {driver}</li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {riskCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() =>
                setDrillDown({
                  kind: "action",
                  row: center.actionBoard[0] ?? {
                    id: card.id,
                    category: "coverage-risk",
                    categoryLabel: card.label,
                    issue: card.topIssue,
                    impact: `${card.count} items`,
                    impactScore: 70,
                    owner: "Leadership",
                    ownerRole: "executive",
                    suggestedAction: card.topIssue,
                    dueDate: null,
                    status: "open",
                    source: "territory-intelligence",
                    manualOnly: true,
                  },
                })
              }
              className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 text-left hover:border-teal-500/35"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">{card.count}</p>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{card.topIssue}</p>
            </button>
          ))}
        </div>
      </section>

      <section className={UI_SPACE.section}>
        <div className={UI_LAYOUT.pageHeader}>
          <h3 className={UI_TYPE.sectionTitle}>Executive action board</h3>
          <div className={UI_LAYOUT.toolbar}>
            <button
              type="button"
              onClick={() => exportExecutiveActionBoardCsv(center)}
              className={UI_BUTTON.ghost}
            >
              Export actions
            </button>
          </div>
        </div>
        {center.actionBoard.length === 0 ? (
          <WorkspaceEmptyState
            title="No executive actions"
            message="The action board is clear — no high-impact items need leadership attention."
            nextStep="Check project and territory war rooms for emerging risks."
            onRefresh={() => void load()}
          />
        ) : (
        <ul className={UI_SPACE.stackSm}>
          {center.actionBoard.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                onClick={() => setDrillDown({ kind: "action", row: action })}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3 text-left hover:border-teal-500/30"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-50">{action.issue}</p>
                  <p className="mt-0.5 text-xs text-teal-200/90">{action.suggestedAction}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-400">
                  {action.impactScore}
                </span>
              </button>
            </li>
          ))}
        </ul>
        )}
      </section>

      <section className={UI_SPACE.section}>
        <div className={UI_LAYOUT.pageHeader}>
          <div className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-0.5">
            {(
              [
                ["projects", "Project war room"],
                ["territories", "Territory war room"],
                ["recruiters", "Recruiter war room"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setWarRoomTab(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  warRoomTab === id ? "bg-teal-600/25 text-teal-100" : "text-zinc-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={UI_LAYOUT.toolbar}>
            <button
              type="button"
              onClick={() => exportExecutiveProjectsCsv(center)}
              className={UI_BUTTON.ghost}
            >
              Export projects
            </button>
            <button
              type="button"
              onClick={() => exportExecutiveTerritoriesCsv(center)}
              className={UI_BUTTON.ghost}
            >
              Export territories
            </button>
            <button
              type="button"
              onClick={() => exportExecutiveRecruitersCsv(center)}
              className={UI_BUTTON.ghost}
            >
              Export recruiters
            </button>
          </div>
        </div>

        {warRoomTab === "projects" ? (
          <div className={UI_SPACE.section}>
            <div className={UI_INPUT.filterBar}>
              <select
                className={UI_INPUT.select}
                value={projectClientFilter}
                onChange={(e) => setProjectClientFilter(e.target.value)}
              >
                <option value="all">All clients</option>
                {projectFilters.clients.map((client) => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
              <select
                className={UI_INPUT.select}
                value={projectDmFilter}
                onChange={(e) => setProjectDmFilter(e.target.value)}
              >
                <option value="all">All DMs</option>
                {projectFilters.dms.map((dm) => (
                  <option key={dm} value={dm}>{dm}</option>
                ))}
              </select>
              <select
                className={UI_INPUT.select}
                value={projectStateFilter}
                onChange={(e) => setProjectStateFilter(e.target.value)}
              >
                <option value="all">All states</option>
                {projectFilters.states.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              <select
                className={UI_INPUT.select}
                value={projectRiskFilter}
                onChange={(e) => setProjectRiskFilter(e.target.value)}
              >
                <option value="all">All risk levels</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="healthy">Healthy</option>
              </select>
            </div>
            {filteredProjects.length === 0 ? (
              <WorkspaceEmptyState
                title="No projects match filters"
                message="Adjust client, DM, state, or risk filters to see project war room rows."
                nextStep="Reset filters to All to view the full portfolio."
                onRefresh={() => {
                  setProjectClientFilter("all");
                  setProjectDmFilter("all");
                  setProjectStateFilter("all");
                  setProjectRiskFilter("all");
                }}
                refreshLabel="Reset filters"
              />
            ) : (
            <div className={UI_SURFACE.tableWrap}>
              <table className={UI_LAYOUT.responsiveTable}>
                <thead className={UI_TYPE.tableHead}>
                  <tr>
                    <th className="px-3 py-2">Project</th>
                    <th className="px-3 py-2">Open</th>
                    <th className="px-3 py-2">Coverage</th>
                    <th className="px-3 py-2">Applicants</th>
                    <th className="px-3 py-2">Risk</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                  {filteredProjects.map((row) => (
                    <tr
                      key={row.opportunityId}
                      className="cursor-pointer hover:bg-zinc-800/30"
                      onClick={() => setDrillDown({ kind: "project", row })}
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.projectName}</p>
                        <p className="text-xs text-zinc-500">{row.client} · {row.state}</p>
                      </td>
                      <td className="px-3 py-2">{row.openCalls}</td>
                      <td className="px-3 py-2">{row.coveragePercent}%</td>
                      <td className="px-3 py-2">{row.applicantCount}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${RISK_CHIP[row.riskLevel]}`}>
                          {row.riskLevel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{row.owner}</td>
                      <td className="px-3 py-2 text-xs text-zinc-400">{row.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        ) : null}

        {warRoomTab === "territories" ? (
          <div className={UI_SURFACE.tableWrap}>
            <table className={UI_LAYOUT.responsiveTable}>
              <thead className={UI_TYPE.tableHead}>
                <tr>
                  <th className="px-3 py-2">DM</th>
                  <th className="px-3 py-2">States</th>
                  <th className="px-3 py-2">Coverage</th>
                  <th className="px-3 py-2">Open Calls</th>
                  <th className="px-3 py-2">Rep Pool</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2">Priority Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {center.territoryWarRoom.map((row) => (
                  <tr
                    key={row.dmName}
                    className={`cursor-pointer hover:bg-zinc-800/30 ${TERRITORY_TIER_ROW[row.riskTier]}`}
                    onClick={() => setDrillDown({ kind: "territory", row })}
                  >
                    <td className="px-3 py-2 font-medium">{row.dmName}</td>
                    <td className="px-3 py-2 text-xs">{row.states.join(", ")}</td>
                    <td className="px-3 py-2">{row.coveragePercent}%</td>
                    <td className="px-3 py-2">{row.openCalls}</td>
                    <td className="px-3 py-2">{row.repPool}</td>
                    <td className="px-3 py-2">{row.riskScore}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {row.priorityActions.join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {warRoomTab === "recruiters" ? (
          <div className={UI_SURFACE.tableWrap}>
            <table className={UI_LAYOUT.responsiveTable}>
              <thead className={UI_TYPE.tableHead}>
                <tr>
                  <th className="px-3 py-2">Recruiter</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Follow-ups</th>
                  <th className="px-3 py-2">Paperwork</th>
                  <th className="px-3 py-2">MEL</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {center.recruiterWarRoom.map((row) => (
                  <tr
                    key={row.recruiterName}
                    className="cursor-pointer hover:bg-zinc-800/30"
                    onClick={() => setDrillDown({ kind: "recruiter", row })}
                  >
                    <td className="px-3 py-2 font-medium">{row.recruiterName}</td>
                    <td className="px-3 py-2">{row.assignedCandidates}</td>
                    <td className="px-3 py-2">{row.followUpsDue}</td>
                    <td className="px-3 py-2">{row.paperwork}</td>
                    <td className="px-3 py-2">{row.readyForMel}</td>
                    <td className="px-3 py-2">{row.workloadScore}</td>
                    <td className="px-3 py-2 capitalize">{row.status.replace("-", " ")}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{row.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-zinc-50">Project forecasting</h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {center.projectForecasts.slice(0, 15).map((row) => (
                <tr key={row.opportunityId}>
                  <td className="px-3 py-2 font-medium">{row.projectName}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${FORECAST_CHIP[row.outcome]}`}>
                      {row.outcome.replace(/-/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.confidenceScore}%</td>
                  <td className="px-3 py-2 text-xs text-zinc-400">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ExecutiveDrillDownPanel drillDown={drillDown} onClose={() => setDrillDown(null)} />
    </div>
      ) : null}
    </WorkspacePageShell>
  );
}
