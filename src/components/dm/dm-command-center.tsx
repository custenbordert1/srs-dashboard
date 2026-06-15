"use client";

import { DmActionCenter } from "@/components/dm/dm-action-center";
import { DmOperationalDrawer } from "@/components/dm/dm-operational-drawer";
import { DmToast } from "@/components/dm/dm-toast";
import { PanelCard } from "@/components/ui/panel-card";
import { TrustGatedKpiShell } from "@/components/ui/trust-gated-kpi";
import { useDmEscalationQueue } from "@/hooks/use-dm-escalation-queue";
import { useDmOperationalDrawer } from "@/hooks/use-dm-operational-drawer";
import type { UserPublic } from "@/lib/auth/types";
import { buildDataTrustState, type DataTrustInput } from "@/lib/data-trust-state";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import {
  buildDmCommandCenterSnapshot,
  DM_COMMAND_CENTER_SECTION_IDS,
  type DmCommandCenterRiskLevel,
  type DmCommandCenterSnapshot,
  type DmEscalationCenterItem,
  type DmTerritoryPriorityItem,
} from "@/lib/dm-portal/build-dm-command-center";
import { buildDmPortalOperationalView } from "@/lib/dm-portal/dm-portal-operational";
import {
  OPERATIONAL_ESCALATION_LABELS,
  RECRUITER_ESCALATION_STATUS_LABELS,
} from "@/lib/operational-escalation/operational-escalation-types";
import { resolveKpiTrustPresentation } from "@/lib/kpi-trust-gating";
import Link from "next/link";
import { useEffect, useMemo } from "react";

type DmCommandCenterProps = {
  data: DmDashboardSnapshot;
  user: UserPublic;
  trustInput: DataTrustInput;
  onCandidateClick: (candidateId: string) => void;
};

function riskStyles(level: DmCommandCenterRiskLevel): string {
  switch (level) {
    case "critical":
      return "border-red-500/40 bg-red-500/10 text-red-100";
    case "high":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "medium":
      return "border-sky-500/35 bg-sky-500/10 text-sky-100";
    default:
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-100";
  }
}

function priorityStyles(priority: DmPrioritizedAlert["priority"]): string {
  switch (priority) {
    case "critical":
      return "bg-red-500 text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-amber-500 text-zinc-950";
    default:
      return "bg-zinc-600 text-zinc-100";
  }
}

function ActionNavCard({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-3 transition hover:border-teal-500/40 hover:bg-teal-500/5"
    >
      <p className="text-sm font-semibold text-zinc-100 group-hover:text-teal-100">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
    </Link>
  );
}

function CommandKpiGrid({
  center,
  trustInput,
}: {
  center: DmCommandCenterSnapshot;
  trustInput: DataTrustInput;
}) {
  const dataTrust = buildDataTrustState(trustInput);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {center.kpis.map((kpi) => (
        <TrustGatedKpiShell
          key={kpi.id}
          presentation={resolveKpiTrustPresentation(dataTrust, kpi.id, "dm-territory-stat", trustInput)}
          className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{kpi.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{kpi.value}</p>
          {kpi.hint ? <p className="mt-1 text-xs text-zinc-500">{kpi.hint}</p> : null}
        </TrustGatedKpiShell>
      ))}
    </div>
  );
}

function PriorityQueueList({
  items,
  onOpen,
}: {
  items: DmTerritoryPriorityItem[];
  onOpen: (item: DmTerritoryPriorityItem) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No priority actions right now.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-800/80">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="flex w-full items-start justify-between gap-3 py-3 text-left transition hover:bg-zinc-950/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityStyles(item.priority)}`}
                >
                  {item.priority}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600">{item.categoryLabel}</span>
                <span className="text-[10px] tabular-nums text-zinc-600">Impact {item.impactScore}</span>
              </div>
              <p className="mt-1.5 text-[15px] font-medium text-zinc-100">{item.title}</p>
              <p className="mt-0.5 text-sm text-zinc-500">{item.detail}</p>
              <p className="mt-1 text-xs text-teal-300/90">{item.recommendedAction}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function DmCommandCenter({ data, user, trustInput, onCandidateClick }: DmCommandCenterProps) {
  const center = useMemo(() => buildDmCommandCenterSnapshot(data), [data]);
  const operational = useMemo(() => buildDmPortalOperationalView(data), [data]);
  const ops = useDmOperationalDrawer(data, user);
  const escalationQueue = useDmEscalationQueue();

  const actionCenterJobs = useMemo(
    () =>
      Object.values(data.operationalIndex.jobsById)
        .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
        .slice(0, 20),
    [data.operationalIndex.jobsById],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const candidateId = params.get("candidateId");
    if (candidateId) onCandidateClick(candidateId);
    const jobId = params.get("jobId");
    if (jobId) ops.openJob(jobId);
    if (!window.location.hash) return;
    const id = window.location.hash.replace(/^#/, "");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data.fetchedAt, onCandidateClick, ops.openJob]);

  const openPriorityItem = (item: DmTerritoryPriorityItem) => {
    if (item.jobId) {
      ops.openJob(item.jobId);
      return;
    }
    if (item.alertId && data.operationalIndex.alertsById[item.alertId]) {
      ops.openAlert(data.operationalIndex.alertsById[item.alertId]);
      return;
    }
    const hit = data.prioritizedAlerts.find((alert) => alert.id === item.alertId);
    if (hit) ops.openAlert(hit);
  };

  const openEscalationItem = (item: DmEscalationCenterItem) => {
    if (item.jobId) {
      ops.openJob(item.jobId);
      return;
    }
    if (item.alertId && data.operationalIndex.alertsById[item.alertId]) {
      ops.openAlert(data.operationalIndex.alertsById[item.alertId]);
    }
  };

  return (
    <div className="space-y-6">
      <section
        id={DM_COMMAND_CENTER_SECTION_IDS.home}
        className="scroll-mt-24 rounded-xl border border-teal-500/25 bg-teal-500/5 px-4 py-4 sm:px-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-300/90">DM command center</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-50">
          {center.dmName} · {center.territoryLabel}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Territory operations for {center.territoryStates.join(", ") || "assigned states"} — updated{" "}
          {new Date(center.fetchedAt).toLocaleString()}
        </p>
        <div className="mt-4">
          <CommandKpiGrid center={center} trustInput={trustInput} />
        </div>
      </section>

      <section id={DM_COMMAND_CENTER_SECTION_IDS.actions} className="scroll-mt-24">
        <h2 className="text-base font-semibold text-zinc-100">Quick actions</h2>
        <p className="mt-1 text-sm text-zinc-500">Review territory, projects, reps, and escalations on this page.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionNavCard
            label="Review territory"
            description="State coverage and open calls"
            href={`#${DM_COMMAND_CENTER_SECTION_IDS.territoryMap}`}
          />
          <ActionNavCard
            label="Review projects"
            description="Staffing risk by active project"
            href={`#${DM_COMMAND_CENTER_SECTION_IDS.projectStaffing}`}
          />
          <ActionNavCard
            label="Review rep pool"
            description="Capacity and utilization"
            href={`#${DM_COMMAND_CENTER_SECTION_IDS.repUtilization}`}
          />
          <ActionNavCard
            label="Review escalations"
            description="Recruiter, coverage, and project risks"
            href={`#${DM_COMMAND_CENTER_SECTION_IDS.escalationCenter}`}
          />
        </div>
      </section>

      <div id={DM_COMMAND_CENTER_SECTION_IDS.priorityQueue} className="scroll-mt-24">
        <PanelCard
          title="Territory priority queue"
          description="Highest-impact actions sorted by impact score — coverage, applicants, staffing, and projects."
        >
          <PriorityQueueList items={center.priorityQueue} onOpen={openPriorityItem} />
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div id={DM_COMMAND_CENTER_SECTION_IDS.territoryMap} className="scroll-mt-24">
          <PanelCard
            title="Territory map (preview)"
            description={`Map integration pending — ${center.territoryMap.cellsPrepared} heatmap cells prepared for future geocoding.`}
          >
            <div className="overflow-x-auto rounded-lg border border-dashed border-zinc-700/80 bg-zinc-950/40">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-800/80 text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">State</th>
                    <th className="px-3 py-2">Coverage</th>
                    <th className="px-3 py-2">Open calls</th>
                    <th className="px-3 py-2">Reps</th>
                    <th className="px-3 py-2">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {center.territoryMap.states.map((row) => (
                    <tr key={row.state} className="hover:bg-zinc-900/40">
                      <td className="px-3 py-2 font-medium text-zinc-100">{row.state}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{row.coveragePercent}%</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{row.openCalls}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-300">{row.repCount}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${riskStyles(row.riskLevel)}`}
                        >
                          {row.riskLevel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </div>

        <div id={DM_COMMAND_CENTER_SECTION_IDS.repUtilization} className="scroll-mt-24">
          <PanelCard
            title="Rep utilization"
            description="Quick visibility into rep capacity across the territory."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {center.repUtilization.map((bucket) => (
                <div
                  key={bucket.id}
                  className={`rounded-lg border px-3 py-3 ${
                    bucket.tone === "ok"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : bucket.tone === "warn"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-zinc-800/80 bg-zinc-950/40"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{bucket.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{bucket.count}</p>
                  <p className="mt-1 text-xs text-zinc-500">{bucket.hint}</p>
                </div>
              ))}
            </div>
          </PanelCard>
        </div>
      </div>

      <div id={DM_COMMAND_CENTER_SECTION_IDS.projectStaffing} className="scroll-mt-24">
        <PanelCard
          title="Project staffing"
          description="Open calls, fill progress, and risk by active project."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-800/80 text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Project</th>
                  <th className="px-2 py-2">Location</th>
                  <th className="px-2 py-2">Open</th>
                  <th className="px-2 py-2">Filled</th>
                  <th className="px-2 py-2">Coverage</th>
                  <th className="px-2 py-2">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {center.projectStaffing.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-900/40">
                    <td className="px-2 py-2">
                      <p className="font-medium text-zinc-100">{row.projectName}</p>
                      <p className="text-xs text-zinc-500">{row.client}</p>
                    </td>
                    <td className="px-2 py-2 text-zinc-400">{row.location}</td>
                    <td className="px-2 py-2 tabular-nums">{row.openCalls}</td>
                    <td className="px-2 py-2 tabular-nums">{row.filledCalls}</td>
                    <td className="px-2 py-2 tabular-nums">{row.coveragePercent}%</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${riskStyles(row.riskLevel)}`}
                      >
                        {row.riskLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </div>

      <div id={DM_COMMAND_CENTER_SECTION_IDS.escalationCenter} className="scroll-mt-24">
        <PanelCard
          title="Escalation center"
          description="Recruiter escalations, coverage risk, and project risk in one place."
          tone="warning"
        >
          <div className="space-y-4">
            <ul className="divide-y divide-zinc-800/80">
              {center.escalationCenter.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openEscalationItem(item)}
                    className="flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-zinc-950/40"
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
                        {item.sourceLabel}
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-100">{item.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{item.detail}</p>
                      <p className="mt-1 text-xs text-teal-300/90">{item.recommendedAction}</p>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{item.impactScore}</span>
                  </button>
                </li>
              ))}
            </ul>

            {escalationQueue.items.length > 0 ? (
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Submitted escalations</p>
                <ul className="mt-2 space-y-2">
                  {escalationQueue.items.slice(0, 5).map((item) => (
                    <li key={item.id} className="text-sm text-zinc-300">
                      <span className="font-medium text-zinc-100">
                        {OPERATIONAL_ESCALATION_LABELS[item.escalationType]}
                      </span>
                      <span className="text-zinc-600"> · </span>
                      {RECRUITER_ESCALATION_STATUS_LABELS[item.status]}
                      {item.jobTitle ? ` · ${item.jobTitle}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <DmActionCenter
              territory={operational.territory}
              jobs={actionCenterJobs}
              user={user}
              onOpenJob={ops.openJob}
              onToast={(message, tone) => ops.showToast(message, tone)}
              onEscalationSubmitted={ops.syncEscalationLogs}
            />
          </div>
        </PanelCard>
      </div>

      <DmOperationalDrawer
        open={ops.open}
        view={ops.view}
        escalationLogs={ops.escalationLogs}
        onClose={ops.close}
        onEscalation={ops.logEscalation}
        onSelectJob={ops.openJob}
      />
      <DmToast toast={ops.toast} onDismiss={ops.dismissToast} />
    </div>
  );
}
