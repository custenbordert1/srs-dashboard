"use client";

import {
  DM_PORTAL_NAV_LINKS,
  DM_PORTAL_SECTION_IDS,
  buildDmPortalOperationalView,
  coverageTierLabel,
  coverageTierStyles,
  resolveDmPortalAlertHref,
  severityLabel,
  topNeedsAttentionAlerts,
} from "@/lib/dm-portal/dm-portal-operational";
import type { DmViewVisibility } from "@/lib/dm-portal/dm-view-mode";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import Link from "next/link";
import { useEffect } from "react";

type DmPortalDashboardPrototypeProps = {
  data: DmDashboardSnapshot;
  visibility: DmViewVisibility;
  territoryLabel: string;
};

function SectionShell({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-[10px] leading-snug text-zinc-600">{hint}</p> : null}
    </div>
  );
}

function priorityBadgeClass(priority: DmPrioritizedAlert["priority"]): string {
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

function NeedsAttentionList({ alerts }: { alerts: DmPrioritizedAlert[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-zinc-500">No territory alerts right now.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-800/80">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadgeClass(alert.priority)}`}
              >
                {severityLabel(alert.priority)}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-zinc-600">{alert.alertTypeLabel}</span>
            </div>
            <p className="mt-1.5 text-sm font-medium text-zinc-100">{alert.title}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{alert.detail}</p>
            <p className="mt-1 text-[11px] text-zinc-600">{alert.recommendedAction}</p>
            <Link
              href={resolveDmPortalAlertHref(alert)}
              className="mt-2 inline-flex text-xs font-medium text-teal-400 hover:text-teal-300"
            >
              View in territory dashboard →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NavCard({
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
      <p className="mt-2 text-[11px] font-medium text-teal-400/90">Jump to section →</p>
    </Link>
  );
}

export function DmPortalDashboardPrototype({
  data,
  visibility,
  territoryLabel,
}: DmPortalDashboardPrototypeProps) {
  const operational = buildDmPortalOperationalView(data);
  const { territory, pipeline } = operational;
  const tierStyles = coverageTierStyles(territory.coverageTier);
  const topAlerts = topNeedsAttentionAlerts(data);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const id = window.location.hash.replace(/^#/, "");
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-300/90">DM operations</p>
        <p className="mt-1 text-sm text-zinc-300">
          Daily view for <span className="font-medium text-zinc-100">{data.dmName}</span> · {territoryLabel}
        </p>
      </div>

      <section id={DM_PORTAL_SECTION_IDS.quickNav} className="scroll-mt-24">
        <h2 className="text-sm font-semibold text-zinc-100">Quick navigation</h2>
        <p className="mt-1 text-xs text-zinc-500">Jump to operational sections on this dashboard.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DM_PORTAL_NAV_LINKS.map((item) => (
            <NavCard key={item.id} label={item.label} description={item.description} href={item.href} />
          ))}
        </div>
      </section>

      {visibility.showOpenJobs ? (
        <SectionShell
          id={DM_PORTAL_SECTION_IDS.territorySummary}
          title="Territory summary"
          description="Assigned states and live recruiting demand in your territory."
        >
          <p className="mb-3 text-xs text-zinc-400">
            <span className="font-medium text-zinc-300">{territory.stateCount} states:</span>{" "}
            {territory.states.join(", ") || "—"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <StatCell label="Open jobs" value={territory.openJobs.toLocaleString()} />
            <StatCell label="Open calls" value={territory.openCalls.toLocaleString()} />
            <StatCell label="Active reps" value={territory.activeReps.toLocaleString()} hint="Onboarded + hired proxy" />
            <StatCell
              label="Territory health"
              value={`${territory.coveragePercent}%`}
              hint={`${coverageTierLabel(territory.coverageTier)} · composite recruiting index`}
            />
            <StatCell
              label="Alerts"
              value={operational.needsAttentionTotal.toLocaleString()}
              hint={`${data.alertSummary.criticalCount} critical`}
            />
          </div>
        </SectionShell>
      ) : null}

      {visibility.showCoveragePercent ? (
        <section
          id={DM_PORTAL_SECTION_IDS.territoryHealth}
          className={`scroll-mt-24 rounded-xl border px-4 py-4 ${tierStyles.border} ${tierStyles.bg}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={`text-sm font-semibold ${tierStyles.text}`}>Territory health</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Territory health score · {data.health.label}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tierStyles.text} border ${tierStyles.border}`}>
              {coverageTierLabel(territory.coverageTier)}
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-4xl font-semibold tabular-nums ${tierStyles.text}`}>
                {territory.coveragePercent}%
              </p>
              <p className="text-xs text-zinc-500">Green ≥80% · Yellow 50–79% · Red &lt;50%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-950/80">
              <div
                className={`h-full rounded-full transition-all ${tierStyles.meter}`}
                style={{ width: `${Math.min(100, Math.max(0, territory.coveragePercent))}%` }}
              />
            </div>
          </div>
        </section>
      ) : null}

      <SectionShell
        id={DM_PORTAL_SECTION_IDS.recruitingPipeline}
        title="Recruiting pipeline summary"
        description="Applicant flow and onboarding progress in your assigned states."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCell
            label="Applicants (7 days)"
            value={pipeline.applicantsLast7Days.toLocaleString()}
          />
          <StatCell label="Paperwork sent" value={pipeline.paperworkSent.toLocaleString()} />
          <StatCell
            label="Ready for MEL"
            value={pipeline.readyForMel.toLocaleString()}
            hint="DD approved + MEL project matches"
          />
          <StatCell label="Hired" value={pipeline.hired.toLocaleString()} />
        </div>
      </SectionShell>

      {visibility.showNeedsAttention ? (
        <SectionShell
          id={DM_PORTAL_SECTION_IDS.needsAttention}
          title="Needs attention"
          description="Top 10 prioritized alerts — severity ranked for your territory."
        >
          <NeedsAttentionList alerts={topAlerts} />
        </SectionShell>
      ) : null}

      {visibility.showOpenOpportunities ? (
        <SectionShell
          id={DM_PORTAL_SECTION_IDS.openOpportunities}
          title="Open opportunities"
          description="High-priority unstaffed MEL stores in your territory."
        >
          {data.melMatching.unstaffedHighPriorityStores.length === 0 ? (
            <p className="text-sm text-zinc-500">No high-priority unstaffed stores flagged.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {data.melMatching.unstaffedHighPriorityStores.slice(0, 8).map((row, index) => (
                <li key={`${row.projectName}-${row.state}-${index}`} className="py-2.5">
                  <p className="text-sm font-medium text-zinc-100">{row.projectName}</p>
                  <p className="text-xs text-zinc-500">
                    {row.client} · {row.storeName} · {row.state}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionShell>
      ) : null}

      <SectionShell
        id={DM_PORTAL_SECTION_IDS.coverageIssues}
        title="Coverage issues"
        description="Cities and states with the highest shortage signals."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Top problem cities</p>
            {data.coverage.topProblemCities.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No city-level gaps flagged.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {data.coverage.topProblemCities.slice(0, 6).map((row) => (
                  <li key={row.label} className="flex justify-between text-sm text-zinc-300">
                    <span>{row.label}</span>
                    <span className="tabular-nums text-zinc-500">{row.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Shortages by state</p>
            {data.coverage.candidateShortagesByState.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No state shortages flagged.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {data.coverage.candidateShortagesByState.slice(0, 6).map((row) => (
                  <li key={row.label} className="flex justify-between text-sm text-zinc-300">
                    <span>{row.label}</span>
                    <span className="tabular-nums text-zinc-500">{row.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          {data.alertSummary.criticalCount} critical · {data.alertSummary.highCount} high ·{" "}
          {data.alertSummary.zeroApplicantJobsCount} jobs with zero applicants (7d)
        </p>
      </SectionShell>

      <SectionShell
        id={DM_PORTAL_SECTION_IDS.candidateQueue}
        title="Candidate queue"
        description="Most recent applicants in your territory (from dashboard snapshot)."
      >
        {data.recentApplicants.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent applicants in this snapshot.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {data.recentApplicants.slice(0, 10).map((row) => (
              <li key={row.candidateId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{row.name}</p>
                  <p className="text-xs text-zinc-500">
                    {row.position} · {row.city}, {row.state} · {row.stage}
                  </p>
                </div>
                <Link
                  href={`/dm?section=queue&candidateId=${encodeURIComponent(row.candidateId)}#${DM_PORTAL_SECTION_IDS.candidateQueue}`}
                  className="text-xs font-medium text-teal-400 hover:text-teal-300"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionShell>

      <p className="text-xs text-zinc-600">
        Snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.activeJobs} active jobs · DM operations view
      </p>
    </div>
  );
}
