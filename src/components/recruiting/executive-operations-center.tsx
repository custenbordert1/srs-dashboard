"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import {
  exportExecutiveActionBoardCsv,
  exportExecutiveProjectsCsv,
  exportExecutiveRecruitersCsv,
  exportExecutiveTerritoriesCsv,
  type ExecutiveOperationsCenterSnapshot,
  type ExecutiveProjectWarRoomRow,
  type ExecutiveRecruiterWarRoomRow,
  type ExecutiveTerritoryWarRoomRow,
} from "@/lib/executive-operations-center";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type { CompanyHealthTier, ProjectForecastOutcome } from "@/lib/executive-operations-center/types";
import type { ActionRecommendationCard } from "@/lib/territory-action-engine";
import type { ProjectRiskLevel } from "@/lib/territory-action-engine/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type OpsResponse = {
  ok?: boolean;
  center?: ExecutiveOperationsCenterSnapshot;
  meta?: { partialSync?: boolean; refreshedAt?: string };
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
  critical: "border-red-500/50 bg-red-500/15 text-red-100",
  "at-risk": "border-amber-500/45 bg-amber-500/12 text-amber-100",
  stable: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  healthy: "border-emerald-500/40 bg-emerald-500/12 text-emerald-100",
};

const TERRITORY_TIER_ROW: Record<CompanyHealthTier, string> = {
  critical: "bg-red-500/8",
  "at-risk": "bg-amber-500/6",
  stable: "",
  healthy: "bg-emerald-500/5",
};

const RISK_CHIP: Record<ProjectRiskLevel, string> = {
  critical: "bg-red-500/20 text-red-100",
  high: "bg-amber-500/20 text-amber-100",
  moderate: "bg-sky-500/15 text-sky-100",
  healthy: "bg-emerald-500/15 text-emerald-100",
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
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950 px-6 py-8 text-zinc-50 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-300">
              Boardroom Mode
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
              Executive Operations Center
            </h1>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium hover:bg-zinc-900"
          >
            Exit
          </button>
        </div>

        <section className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-8">
          <p className="text-sm uppercase tracking-wide text-zinc-400">Company Health</p>
          <p className="mt-2 text-7xl font-bold tabular-nums">{center.companyHealth.score}</p>
          <p className="mt-2 text-2xl capitalize text-zinc-200">
            {center.companyHealth.tier.replace("-", " ")} · {trendLabel(center.companyHealth.trend)}
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6">
            <h2 className="text-2xl font-semibold">Top Risks</h2>
            <ul className="mt-4 space-y-4">
              {topRisks.map((risk) => (
                <li key={risk.id}>
                  <p className="text-xl font-medium">{risk.label}</p>
                  <p className="text-3xl font-bold tabular-nums text-amber-200">{risk.count}</p>
                  <p className="text-zinc-400">{risk.topIssue}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6">
            <h2 className="text-2xl font-semibold">Top Actions</h2>
            <ul className="mt-4 space-y-3">
              {center.actionBoard.slice(0, 8).map((action) => (
                <li key={action.id} className="border-b border-zinc-800 pb-3">
                  <p className="text-lg font-medium">{action.issue}</p>
                  <p className="text-zinc-400">{action.suggestedAction}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-6">
          <h2 className="text-2xl font-semibold">Project Forecast</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["likely-to-miss", "at-risk", "likely-to-finish"] as const).map((outcome) => {
              const count = center.projectForecasts.filter((row) => row.outcome === outcome).length;
              return (
                <div key={outcome} className={`rounded-xl border px-4 py-3 ${FORECAST_CHIP[outcome]}`}>
                  <p className="text-sm uppercase tracking-wide opacity-80">{outcome.replace(/-/g, " ")}</p>
                  <p className="text-4xl font-bold tabular-nums">{count}</p>
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

  const projectFilters = useMemo(() => {
    if (!center) return { clients: [], dms: [], states: [] };
    const clients = [...new Set(center.projectWarRoom.map((row) => row.client).filter(Boolean))].sort();
    const dms = [...new Set(center.projectWarRoom.map((row) => row.dmName).filter(Boolean))].sort();
    const states = [...new Set(center.projectWarRoom.map((row) => row.state).filter(Boolean))].sort();
    return { clients, dms, states };
  }, [center]);

  const filteredProjects = useMemo(() => {
    if (!center) return [];
    return center.projectWarRoom.filter((row) => {
      if (projectClientFilter !== "all" && row.client !== projectClientFilter) return false;
      if (projectDmFilter !== "all" && row.dmName !== projectDmFilter) return false;
      if (projectStateFilter !== "all" && row.state !== projectStateFilter) return false;
      if (projectRiskFilter !== "all" && row.riskLevel !== projectRiskFilter) return false;
      return true;
    });
  }, [center, projectClientFilter, projectDmFilter, projectRiskFilter, projectStateFilter]);

  const dataTrust = {
    hasData: Boolean(center),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  if (loading && !center) {
    return <p className="text-sm text-zinc-500">Loading operations center…</p>;
  }

  if (error && !center) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!center) return null;

  if (boardroom) {
    return <BoardroomMode center={center} onExit={() => setBoardroom(false)} />;
  }

  const riskCards = [
    center.riskSummaries.criticalActions,
    center.riskSummaries.projectRisk,
    center.riskSummaries.territoryRisk,
    center.riskSummaries.recruiterRisk,
    center.riskSummaries.coverageRisk,
  ];

  return (
    <div id="executive-operations-center" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Operations Center</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Action-first leadership view — what needs intervention now.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataTrustBadge trust={dataTrust} />
          <button
            type="button"
            onClick={() => setBoardroom(true)}
            className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-500/20"
          >
            Boardroom Mode
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
          >
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-50">Executive action board</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportExecutiveActionBoardCsv(center)}
              className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Export actions
            </button>
          </div>
        </div>
        <ul className="space-y-2">
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
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportExecutiveProjectsCsv(center)}
              className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Export projects
            </button>
            <button
              type="button"
              onClick={() => exportExecutiveTerritoriesCsv(center)}
              className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Export territories
            </button>
            <button
              type="button"
              onClick={() => exportExecutiveRecruitersCsv(center)}
              className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Export recruiters
            </button>
          </div>
        </div>

        {warRoomTab === "projects" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                value={projectClientFilter}
                onChange={(e) => setProjectClientFilter(e.target.value)}
              >
                <option value="all">All clients</option>
                {projectFilters.clients.map((client) => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
              <select
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                value={projectDmFilter}
                onChange={(e) => setProjectDmFilter(e.target.value)}
              >
                <option value="all">All DMs</option>
                {projectFilters.dms.map((dm) => (
                  <option key={dm} value={dm}>{dm}</option>
                ))}
              </select>
              <select
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                value={projectStateFilter}
                onChange={(e) => setProjectStateFilter(e.target.value)}
              >
                <option value="all">All states</option>
                {projectFilters.states.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
              <select
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
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
            <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
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
          </div>
        ) : null}

        {warRoomTab === "territories" ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
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
          <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
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
  );
}
