"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { PanelCard } from "@/components/ui/panel-card";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import {
  persistActionStatus,
  readActionStatusMap,
  type ActionStatusPreference,
} from "@/lib/territory-action-engine/action-status-preferences";
import type {
  ActionRecommendationCard,
  ProjectRiskRow,
  RecruiterWorkloadRow,
  RepCapacityRow,
  TerritoryActionCenterSnapshot,
  TerritoryPlaybook,
} from "@/lib/territory-action-engine";
import {
  UI_BUTTON,
  UI_INPUT,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useMemo, useState } from "react";

type ActionCenterResponse = {
  ok?: boolean;
  center?: TerritoryActionCenterSnapshot;
  meta?: {
    partialSync?: boolean;
    hasCoverageData?: boolean;
    refreshedAt?: string;
  };
  error?: string;
};

type QueueView = "priority" | "executive" | "dm" | "recruiter";

const IMPACT_STYLES = (score: number): string => {
  if (score >= 80) return "border-red-500/40 bg-red-500/10 text-red-100";
  if (score >= 65) return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  return "border-sky-500/35 bg-sky-500/10 text-sky-100";
};

const RISK_STYLES: Record<ProjectRiskRow["riskLevel"], string> = {
  critical: "bg-red-500/15 text-red-100 border-red-500/40",
  high: "bg-amber-500/15 text-amber-100 border-amber-500/40",
  moderate: "bg-sky-500/15 text-sky-100 border-sky-500/40",
  healthy: "bg-emerald-500/15 text-emerald-100 border-emerald-500/40",
};

const CAPACITY_STYLES: Record<RepCapacityRow["capacityLabel"], string> = {
  "can-absorb": "text-emerald-200",
  "near-capacity": "text-amber-200",
  "at-risk": "text-red-200",
};

function ActionRecommendationCardView({
  card,
  status,
  onStatusChange,
}: {
  card: ActionRecommendationCard;
  status: ActionStatusPreference;
  onStatusChange: (id: string, status: ActionStatusPreference) => void;
}) {
  return (
    <li className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${IMPACT_STYLES(card.impactScore)}`}
            >
              {card.categoryLabel}
            </span>
            <span className="text-[10px] font-medium tabular-nums text-zinc-500">
              Impact {card.impactScore}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-zinc-50">{card.issue}</p>
          <p className="mt-1 text-xs text-zinc-400">{card.impact}</p>
        </div>
        <select
          aria-label={`Status for ${card.issue}`}
          value={status}
          onChange={(event) =>
            onStatusChange(card.id, event.target.value as ActionStatusPreference)
          }
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
        >
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-medium uppercase tracking-wide text-zinc-500">Owner</p>
          <p className="mt-0.5 text-zinc-200">{card.owner}</p>
        </div>
        <div>
          <p className="font-medium uppercase tracking-wide text-zinc-500">Suggested action</p>
          <p className="mt-0.5 text-teal-200/90">{card.suggestedAction}</p>
        </div>
        <div>
          <p className="font-medium uppercase tracking-wide text-zinc-500">Due</p>
          <p className="mt-0.5 text-zinc-200">{card.dueDate ?? "—"}</p>
        </div>
        <div>
          <p className="font-medium uppercase tracking-wide text-zinc-500">Automation</p>
          <p className="mt-0.5 text-zinc-400">
            {card.automationKind ? `${card.automationKind} (future)` : "Manual only"}
          </p>
        </div>
      </div>
      {card.candidateId ? (
        <button
          type="button"
          onClick={() =>
            navigateRecruitingTab({ tab: "candidates", elementId: "recruiter-action-queue" })
          }
          className="mt-3 text-xs font-medium text-teal-300 hover:text-teal-200"
        >
          Open in Candidates →
        </button>
      ) : null}
    </li>
  );
}

function PlaybookCard({ playbook }: { playbook: TerritoryPlaybook }) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-50">{playbook.dmName}</h4>
        <span className="text-xs text-zinc-500">{playbook.territoryLabel}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-amber-100">{playbook.problem}</p>
      <p className="mt-1 text-xs text-zinc-400">{playbook.whyItMatters}</p>
      <ol className="mt-3 space-y-1.5">
        {playbook.recommendedActions.map((step) => (
          <li key={step.order} className="flex gap-2 text-xs text-zinc-200">
            <span className="font-semibold text-teal-400">{step.order}.</span>
            <span>{step.action}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function TerritoryActionCenter() {
  const [center, setCenter] = useState<TerritoryActionCenterSnapshot | null>(null);
  const [meta, setMeta] = useState<ActionCenterResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueView, setQueueView] = useState<QueueView>("priority");
  const [statusMap, setStatusMap] = useState<Record<string, ActionStatusPreference>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/territory-action-engine", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as ActionCenterResponse;
      if (!response.ok || !payload.ok || !payload.center) {
        throw new Error(payload.error ?? "Failed to load action center");
      }
      setCenter(payload.center);
      setMeta(payload.meta);
      setStatusMap(readActionStatusMap());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load action center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatusChange = useCallback((id: string, status: ActionStatusPreference) => {
    persistActionStatus(id, status);
    setStatusMap((prev) => ({ ...prev, [id]: status }));
  }, []);

  const queueItems = useMemo(() => {
    if (!center) return [];
    switch (queueView) {
      case "executive":
        return center.executiveRollup;
      case "dm":
        return center.dmActionQueue;
      case "recruiter":
        return center.recruiterActionQueue;
      default:
        return center.priorityQueue;
    }
  }, [center, queueView]);

  const openQueueItems = useMemo(
    () => queueItems.filter((card) => (statusMap[card.id] ?? card.status) !== "resolved"),
    [queueItems, statusMap],
  );

  const dataTrust = {
    hasData: Boolean(center),
    partialSync: meta?.partialSync ?? false,
    error: error,
  };

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(center)}
      loadingMessage="Loading action center…"
      emptyTitle="Action center unavailable"
      emptyMessage="Territory recommendations will appear after data sync completes."
      emptyNextStep="Confirm Breezy sync and territory intelligence data in Admin."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(center)}
    >
      {center ? (
    <div id="territory-action-center" className={UI_SPACE.page}>
      <div className={UI_LAYOUT.pageHeader}>
        <div>
          <h2 className={UI_TYPE.pageTitle}>Action Center</h2>
          <p className={UI_TYPE.pageSubtitle}>
            Prioritized operational queue — recommendations only, no ATS or MEL write-back.
          </p>
        </div>
        <div className={UI_LAYOUT.toolbar}>
          <DataTrustBadge trust={dataTrust} />
          <button
            type="button"
            onClick={() =>
              navigateRecruitingTab({
                tab: "placement-command-center",
                elementId: "placement-store-coverage",
              })
            }
            className={UI_BUTTON.ghost}
          >
            Placement Center
          </button>
          <button type="button" onClick={() => void load()} className={UI_BUTTON.ghost}>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <PanelCard title="Open actions" className="p-4">
          <p className="text-3xl font-semibold tabular-nums text-zinc-50">{center.meta.totalActions}</p>
        </PanelCard>
        <PanelCard title="Critical impact" className="p-4">
          <p className="text-3xl font-semibold tabular-nums text-red-200">{center.meta.criticalCount}</p>
        </PanelCard>
        <PanelCard title="Territory playbooks" className="p-4">
          <p className="text-3xl font-semibold tabular-nums text-teal-200">
            {center.territoryPlaybooks.length}
          </p>
        </PanelCard>
      </div>

      <section id="territory-priority-queue" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-50">Operational queue</h3>
          <div
            className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/80 p-0.5"
            role="group"
            aria-label="Action queue view"
          >
            {(
              [
                ["priority", "All priorities"],
                ["executive", "Executive top 10"],
                ["dm", "DM queue"],
                ["recruiter", "Recruiter queue"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setQueueView(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  queueView === id
                    ? "bg-teal-600/25 text-teal-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {openQueueItems.length === 0 ? (
          <WorkspaceEmptyState
            title="No open actions in this queue"
            message="Everything in this view is resolved or filtered out."
            nextStep="Switch queue tabs or mark items open in another view."
            onRefresh={() => void load()}
          />
        ) : (
          <ul className="space-y-3">
            {openQueueItems.map((card) => (
              <ActionRecommendationCardView
                key={card.id}
                card={card}
                status={statusMap[card.id] ?? card.status}
                onStatusChange={handleStatusChange}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-zinc-50">Territory playbooks</h3>
        {center.territoryPlaybooks.length === 0 ? (
          <WorkspaceEmptyState
            title="No territory playbooks"
            message="No DM territories currently need a structured playbook."
            nextStep="Check back after the next intelligence refresh."
            onRefresh={() => void load()}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {center.territoryPlaybooks.map((playbook) => (
              <PlaybookCard key={playbook.id} playbook={playbook} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-50">Project risk engine</h3>
          <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {center.projectRisks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-zinc-500">
                      No elevated project risks.
                    </td>
                  </tr>
                ) : (
                  center.projectRisks.map((row) => (
                    <tr key={row.opportunityId}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{row.projectName}</p>
                        <p className="text-xs text-zinc-500">{row.location}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${RISK_STYLES[row.riskLevel]}`}
                        >
                          {row.riskLevel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">{row.riskReason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-50">Rep capacity engine</h3>
          <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">DM</th>
                  <th className="px-3 py-2">Capacity</th>
                  <th className="px-3 py-2">Reps</th>
                  <th className="px-3 py-2">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {center.repCapacities.map((row) => (
                  <tr key={row.dmName}>
                    <td className="px-3 py-2 font-medium">{row.dmName}</td>
                    <td className={`px-3 py-2 text-xs font-semibold ${CAPACITY_STYLES[row.capacityLabel]}`}>
                      {row.capacityLabel.replace("-", " ")} ({row.capacityScore})
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {row.activeReps} active · {row.inactiveReps} inactive
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{row.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-zinc-50">Recruiter workload engine</h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Recruiter</th>
                <th className="px-3 py-2">Assigned</th>
                <th className="px-3 py-2">Follow-ups</th>
                <th className="px-3 py-2">Paperwork</th>
                <th className="px-3 py-2">MEL-ready</th>
                <th className="px-3 py-2">Redistribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {center.recruiterWorkloads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-zinc-500">
                    No recruiter workload signals.
                  </td>
                </tr>
              ) : (
                center.recruiterWorkloads.map((row: RecruiterWorkloadRow) => (
                  <tr key={row.recruiterName}>
                    <td className="px-3 py-2 font-medium">{row.recruiterName}</td>
                    <td className="px-3 py-2">{row.assignedCount}</td>
                    <td className="px-3 py-2">{row.followUpsDue}</td>
                    <td className="px-3 py-2">{row.paperworkPending}</td>
                    <td className="px-3 py-2">{row.readyForMel}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {row.recommendedRedistribution}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
      ) : null}
    </WorkspacePageShell>
  );
}
