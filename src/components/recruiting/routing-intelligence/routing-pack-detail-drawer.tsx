"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";
import type { JobRoutingContext } from "@/lib/routing-intelligence/types";
import type { RoutePackDrawerContext } from "@/lib/routing-intelligence/routing-workspace";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { VariantPerformanceRow } from "@/lib/recruiting-decision-intelligence/types";
import { ROUTE_RISK_STYLES } from "@/lib/routing-intelligence";
import { TRAVEL_TIER_LABELS } from "@/lib/routing-intelligence/travel-tier";
import {
  getRoutingPlanningNote,
  setRoutingPlanningNote,
  toggleRecruiterReviewFlag,
  getRecruiterReviewFlags,
} from "@/lib/routing-intelligence/routing-planning-notes";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";

type RoutingPackDetailDrawerProps = {
  open: boolean;
  pack: EnrichedRoutePack | null;
  drawerContext?: RoutePackDrawerContext;
  escalations: RecruiterEscalationQueueItem[];
  jobContexts: Record<string, JobRoutingContext>;
  variants?: VariantPerformanceRow[];
  onClose: () => void;
};

export function RoutingPackDetailDrawer({
  open,
  pack,
  drawerContext,
  escalations,
  jobContexts,
  variants = [],
  onClose,
}: RoutingPackDetailDrawerProps) {
  const [noteDraft, setNoteDraft] = useState("");
  const [markedReview, setMarkedReview] = useState(false);

  useEffect(() => {
    if (!pack) return;
    setNoteDraft(getRoutingPlanningNote(pack.routePackId));
    setMarkedReview(getRecruiterReviewFlags().has(pack.routePackId));
  }, [pack?.routePackId, pack]);

  if (!open || !pack) return null;

  const relatedJobs = Object.entries(jobContexts).filter(([, ctx]) =>
    ctx.relatedRoutePackIds.includes(pack.routePackId),
  );
  const packEscalations = escalations.filter((row) =>
    drawerContext?.relatedEscalationIds.includes(row.id),
  );
  const packVariants = variants.filter(
    (row) =>
      drawerContext?.variantTitles.includes(row.title) ||
      pack.cities.some(
        (city) =>
          row.cityTarget.toLowerCase().includes(city.toLowerCase()) && row.state === pack.state,
      ),
  );
  const driveHours = Math.round((pack.estimatedDriveTimeMinutes / 60) * 10) / 10;

  return (
    <>
      <button
        type="button"
        aria-label="Close route pack drawer"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-labelledby="routing-pack-drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        <header className="border-b border-zinc-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-teal-400/90">Route pack detail</p>
              <h2 id="routing-pack-drawer-title" className="mt-1 text-lg font-semibold text-zinc-50">
                {pack.label}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {pack.cities.join(" · ")}, {pack.state} · {TRAVEL_TIER_LABELS[pack.travelTier]}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
            >
              Close
            </button>
          </div>
          <span
            className={`mt-3 inline-block rounded-full border px-2 py-0.5 text-[10px] ${ROUTE_RISK_STYLES[pack.staffingRisk]}`}
          >
            {pack.staffingRisk.replace(/_/g, " ")}
          </span>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <MetricsGrid
            miles={pack.estimatedMiles}
            driveHours={driveHours}
            overnight={pack.overnightRequired}
            repCount={pack.suggestedRepCount}
            openJobs={drawerContext?.openJobIds.length ?? 0}
          />

          <DrawerSection title="Grouped stores">
            <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-zinc-300">
              {pack.groupedStores.slice(0, 20).map((store) => (
                <li key={store.opportunityId}>
                  {store.storeName} · {store.city}
                </li>
              ))}
              {pack.groupedStores.length === 0 ? (
                <li className="text-zinc-500">No MEL stores linked to this pack.</li>
              ) : null}
            </ul>
          </DrawerSection>

          <DrawerSection title="Nearby reps">
            <ul className="space-y-1 text-xs text-zinc-300">
              {pack.nearbyReps.slice(0, 6).map((rep) => (
                <li key={rep.repId}>
                  {rep.repName} · {rep.distanceMiles ?? "—"} mi · radius {rep.travelRadiusMiles} mi
                </li>
              ))}
              {pack.nearbyReps.length === 0 ? (
                <li className="text-zinc-500">No active reps within routing radius.</li>
              ) : null}
            </ul>
          </DrawerSection>

          <DrawerSection title="Open jobs">
            <p className="text-xs text-zinc-400">
              {drawerContext?.openJobIds.length ?? 0} jobs · {relatedJobs.length} routing contexts
            </p>
          </DrawerSection>

          <DrawerSection title="Ad variants">
            <ul className="space-y-1 text-xs text-zinc-300">
              {packVariants.slice(0, 6).map((row) => (
                <li key={row.draftId}>
                  {row.title} · {row.cityTarget}
                </li>
              ))}
              {packVariants.length === 0 ? (
                <li className="text-zinc-500">No variants tied to this territory.</li>
              ) : null}
            </ul>
          </DrawerSection>

          <DrawerSection title="Related escalations">
            <ul className="space-y-1 text-xs text-zinc-300">
              {packEscalations.slice(0, 6).map((row) => (
                <li key={row.id}>
                  {row.jobTitle} · {row.city}, {row.state}
                </li>
              ))}
              {packEscalations.length === 0 ? (
                <li className="text-zinc-500">No escalations in this metro.</li>
              ) : null}
            </ul>
          </DrawerSection>

          <DrawerSection title="Territory notes">
            <p className="mb-2 text-[10px] text-zinc-500">Local planning notes only — not synced to server.</p>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
              placeholder="Planning note for this route pack…"
            />
            <button
              type="button"
              onClick={() => {
                setRoutingPlanningNote(pack.routePackId, noteDraft);
              }}
              className="mt-2 rounded-lg border border-teal-600/50 px-2 py-1 text-[11px] text-teal-200"
            >
              Save note (local)
            </button>
          </DrawerSection>
        </div>

        <footer className="border-t border-zinc-800 px-5 py-4">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">Manual workflow</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              label="Open related jobs"
              onClick={() => navigateRecruitingTab({ tab: "job-management" })}
            />
            <ActionButton
              label="Open ad variants"
              onClick={() => navigateRecruitingTab({ tab: "job-management" })}
            />
            <ActionButton
              label="Nearby territories"
              onClick={() => navigateRecruitingTab({ tab: "mel-projects" })}
            />
            <ActionButton
              label="Escalation queue"
              onClick={() =>
                navigateRecruitingTab({ tab: "job-management", elementId: "recruiter-queue" })
              }
            />
            <ActionButton
              label={markedReview ? "Marked for review ✓" : "Mark for recruiter review"}
              onClick={() => {
                const next = toggleRecruiterReviewFlag(pack.routePackId);
                setMarkedReview(next);
              }}
            />
          </div>
        </footer>
      </aside>
    </>
  );
}

function MetricsGrid({
  miles,
  driveHours,
  overnight,
  repCount,
  openJobs,
}: {
  miles: number;
  driveHours: number;
  overnight: boolean;
  repCount: number;
  openJobs: number;
}) {
  const items = [
    { label: "Est. miles", value: String(miles) },
    { label: "Drive hours", value: String(driveHours) },
    { label: "Overnight", value: overnight ? "Yes" : "No" },
    { label: "Suggested reps", value: String(repCount) },
    { label: "Open jobs", value: String(openJobs) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-2">
          <p className="text-[9px] uppercase text-zinc-500">{item.label}</p>
          <p className="text-sm font-semibold text-zinc-100">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-zinc-300">{title}</h3>
      {children}
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-teal-500/40 hover:text-teal-200"
    >
      {label}
    </button>
  );
}
