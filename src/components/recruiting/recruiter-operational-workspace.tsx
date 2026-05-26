"use client";

import { useEffect, useState } from "react";
import type { OperationalWorkspaceJob } from "@/lib/recruiting-dashboard-ux/operational-workspace";
import type { RoutingIntelligenceSnapshot } from "@/lib/routing-intelligence";
import { ROUTE_RISK_STYLES } from "@/lib/routing-intelligence";
import { TRAVEL_TIER_LABELS } from "@/lib/routing-intelligence/travel-tier";
import { RecruiterRouteIntelligenceCards } from "@/components/recruiting/recruiter-route-intelligence-cards";
import {
  SEVERITY_BADGE_STYLES,
  SEVERITY_LABELS,
} from "@/lib/recruiting-dashboard-ux/severity-styles";

export type OperationalQuickAction =
  | "variants"
  | "escalations"
  | "nearby-markets"
  | "pipeline"
  | "related-jobs";

type RecruiterOperationalWorkspaceProps = {
  jobs: OperationalWorkspaceJob[];
  routingIntelligence?: RoutingIntelligenceSnapshot | null;
  onQuickAction?: (action: OperationalQuickAction, job: OperationalWorkspaceJob) => void;
};

export function RecruiterOperationalWorkspace({
  jobs,
  routingIntelligence,
  onQuickAction,
}: RecruiterOperationalWorkspaceProps) {
  const [selectedId, setSelectedId] = useState(jobs[0]?.jobId ?? "");

  useEffect(() => {
    if (jobs.length > 0 && !jobs.some((job) => job.jobId === selectedId)) {
      setSelectedId(jobs[0]!.jobId);
    }
  }, [jobs, selectedId]);

  if (jobs.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Operational workspace</h3>
        <p className="mt-2 text-sm text-zinc-500">No high-risk jobs in the current snapshot.</p>
        <RecruiterRouteIntelligenceCards routing={routingIntelligence} />
      </section>
    );
  }

  const selected = jobs.find((row) => row.jobId === selectedId) ?? jobs[0]!;
  const routing = selected.routing;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-500/8 to-zinc-950/60 p-4 sm:p-5">
        <header className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300/90">
            Operational workspace
          </p>
          <h3 className="mt-1 text-base font-semibold text-zinc-50">Recruiter cockpit</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Staffing gaps, route packs, nearby reps, and manual next steps — snapshot + MEL routing data only.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(200px,240px)_1fr]">
          <ul className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
            {jobs.map((job) => (
              <li key={job.jobId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(job.jobId)}
                  className={[
                    "w-full rounded-lg border px-2.5 py-2 text-left text-xs transition",
                    selected.jobId === job.jobId
                      ? "border-teal-500/50 bg-teal-500/15 text-zinc-100"
                      : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700",
                  ].join(" ")}
                >
                  <p className="font-medium text-zinc-200">{job.jobTitle}</p>
                  <p className="text-[10px] text-zinc-500">
                    {job.city}, {job.state} · Risk {job.territoryRiskScore}
                    {job.routing ? ` · ${job.routing.travelTierLabel}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-zinc-50">
                  {selected.jobTitle} · {selected.city}, {selected.state}
                </h4>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {selected.agingDays != null ? `${selected.agingDays}d aging` : "Age unknown"} ·{" "}
                  {selected.applicantCount} applicants · {selected.nearbyActiveReps} reps ≤25mi
                </p>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_BADGE_STYLES[selected.severity]}`}
              >
                {SEVERITY_LABELS[selected.severity]}
              </span>
            </div>

            {routing ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 ${ROUTE_RISK_STYLES[routing.riskLevel]}`}
              >
                <p className="text-[10px] font-semibold uppercase">Route coverage</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Travel tier" value={TRAVEL_TIER_LABELS[routing.travelTier]} />
                  <Metric label="Nearest rep" value={formatMiles(routing.nearestRepMiles)} />
                  <Metric label="Open stores ≤25mi" value={String(routing.nearbyOpenStores)} />
                  <Metric label="Drive burden" value={String(routing.driveBurdenScore)} />
                  <Metric label="Route difficulty" value={String(routing.estimatedRouteDifficulty)} />
                  <Metric
                    label="Overnight risk"
                    value={routing.overnightRisk ? "Yes" : "No"}
                  />
                  <Metric label="Clustered stores" value={String(routing.clusteredOpportunities)} />
                  <Metric label="Reps ≤25mi" value={String(routing.nearbyRepCount)} />
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Metric label="Territory risk" value={String(selected.territoryRiskScore)} />
              <Metric label="Applicants" value={String(selected.applicantCount)} />
              <Metric label="Escalations" value={String(selected.escalations.length)} />
            </div>

            <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-red-300/90">Recommended action</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-100">{selected.recommendedAction}</p>
              <p className="mt-1 text-xs text-zinc-400">Expected: {selected.expectedOutcome}</p>
            </div>

            {routing && routing.routeGroupingRecommendations.length > 0 ? (
              <div className="mt-3 rounded-lg border border-violet-500/25 bg-violet-500/5 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-violet-300/90">
                  Route grouping
                </p>
                <ul className="mt-1 list-inside list-disc text-xs text-zinc-300">
                  {routing.routeGroupingRecommendations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <InfoBlock title="Metro expansion" lines={selected.metroExpansion} empty="No expansion cities" />
              <InfoBlock title="Pay / radius" lines={selected.payRadiusNotes} empty="No pay/radius notes" />
              <InfoBlock title="Coverage signals" lines={selected.summaryBullets.slice(0, 3)} empty="—" />
              <InfoBlock title="Variants" lines={[selected.variantSummary]} empty="—" />
            </div>

            {routing?.storeCluster ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Store cluster</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {routing.storeCluster.label} · {routing.storeCluster.storeCount} stores ·{" "}
                  {routing.storeCluster.clusterRadiusMiles}mi radius
                </p>
                <ul className="mt-1 max-h-24 overflow-y-auto text-[11px] text-zinc-500">
                  {routing.storeCluster.stores.slice(0, 6).map((store) => (
                    <li key={store.opportunityId}>
                      {store.storeName} · {store.projectName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {routing && routing.nearbyReps.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Nearby reps</p>
                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                  {routing.nearbyReps.map((rep) => (
                    <li key={rep.repId}>
                      {rep.repName} · {formatMiles(rep.distanceMiles)} ·{" "}
                      {rep.active ? "active" : "inactive"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.relatedRoutePacks.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Route packs</p>
                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                  {selected.relatedRoutePacks.map((pack) => (
                    <li key={pack.routePackId}>
                      {pack.label} · {pack.storeCount} stores · {pack.groupingRecommendation}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.escalations.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Escalation history</p>
                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                  {selected.escalations.slice(0, 4).map((row) => (
                    <li key={row.id}>
                      {row.escalationType.replace(/-/g, " ")} · {row.status} · {row.dmName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-zinc-500">Recruiter notes</p>
              <p className="mt-1 text-xs text-zinc-600">Add notes in Job Management or the escalation queue.</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <QuickAction label="Draft variants" onClick={() => onQuickAction?.("variants", selected)} />
              <QuickAction
                label="Escalation queue"
                onClick={() => onQuickAction?.("escalations", selected)}
              />
              <QuickAction
                label="Nearby markets"
                onClick={() => onQuickAction?.("nearby-markets", selected)}
              />
              <QuickAction
                label="Candidate pipeline"
                onClick={() => onQuickAction?.("pipeline", selected)}
              />
              <QuickAction
                label="Related jobs"
                onClick={() => onQuickAction?.("related-jobs", selected)}
              />
            </div>
          </article>
        </div>
      </section>

      <RecruiterRouteIntelligenceCards
        routing={routingIntelligence}
        selectedJobId={selected.jobId}
        onSelectJob={setSelectedId}
      />
    </div>
  );
}

function formatMiles(miles: number | null): string {
  if (miles === null) return "No coverage";
  return `${Math.round(miles)} mi`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1.5">
      <p className="text-[10px] uppercase text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function InfoBlock({
  title,
  lines,
  empty,
}: {
  title: string;
  lines: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/60 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase text-zinc-500">{title}</p>
      {lines.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-600">{empty}</p>
      ) : (
        <ul className="mt-1 list-inside list-disc text-xs text-zinc-400">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:border-teal-500/40 hover:bg-teal-500/10"
    >
      {label}
    </button>
  );
}
