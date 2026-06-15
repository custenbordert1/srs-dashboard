"use client";

import { HealthGroupCard } from "@/components/ui/health-group-card";
import { DataUnavailableSection } from "@/components/ui/data-unavailable-section";
import { STATUS_TONE_STYLES } from "@/lib/ui/status-tone";
import { typography } from "@/lib/ui/typography";
import { buildExecutiveSummaryDisplay } from "@/lib/executive-summary/build-executive-summary-display";
import type { AiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center";
import type { NotificationCenterSnapshot } from "@/lib/notification-engine";
import type { TerritoryIntelligenceCenterSnapshot } from "@/lib/territory-intelligence/types";
import { fetchAiCommandCenterSnapshot } from "@/lib/cached-ai-command-center-client";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export function ExecutiveSummaryDashboard() {
  const [territory, setTerritory] = useState<TerritoryIntelligenceCenterSnapshot | null>(null);
  const [ai, setAi] = useState<AiCommandCenterSnapshot | null>(null);
  const [notifications, setNotifications] = useState<NotificationCenterSnapshot | null>(null);
  const [activeCandidates, setActiveCandidates] = useState<number | null>(null);
  const [avgTimeToFillDays, setAvgTimeToFillDays] = useState<number | null>(null);
  const [openCalls, setOpenCalls] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [territoryRes, aiResult, notifRes, workforceRes, liveRes] = await Promise.all([
          fetchWithTimeout("/api/territory-intelligence", { timeoutMs: FETCH_T4_INTELLIGENCE_MS }),
          fetchAiCommandCenterSnapshot(),
          fetchWithTimeout("/api/notifications?includeDismissed=true", {
            timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
          }),
          fetchWithTimeout("/api/workforce-ops", { timeoutMs: FETCH_T4_INTELLIGENCE_MS }),
          fetchWithTimeout("/api/recruiting/live-snapshot", { timeoutMs: FETCH_T4_INTELLIGENCE_MS }),
        ]);

        if (cancelled) return;

        const territoryParsed = (await territoryRes.json()) as { ok?: boolean; center?: TerritoryIntelligenceCenterSnapshot };
        if (territoryParsed.ok && territoryParsed.center) setTerritory(territoryParsed.center);

        if (aiResult.snapshot) setAi(aiResult.snapshot);

        const notifParsed = (await notifRes.json()) as { ok?: boolean; center?: NotificationCenterSnapshot };
        if (notifParsed.ok && notifParsed.center) setNotifications(notifParsed.center);

        const workforceParsed = (await workforceRes.json()) as {
          ok?: boolean;
          center?: { executiveRollup?: { avgTimeToFillDays?: number | null }; workforceHealth?: { openCalls?: number } };
        };
        if (workforceParsed.ok && workforceParsed.center) {
          setAvgTimeToFillDays(workforceParsed.center.executiveRollup?.avgTimeToFillDays ?? null);
          setOpenCalls(workforceParsed.center.workforceHealth?.openCalls ?? null);
        }

        const liveParsed = (await liveRes.json()) as {
          ok?: boolean;
          candidates?: { candidates?: unknown[] };
        };
        if (liveParsed.ok && liveParsed.candidates?.candidates) {
          setActiveCandidates(liveParsed.candidates.candidates.length);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const display = useMemo(
    () =>
      buildExecutiveSummaryDisplay({
        territory,
        ai,
        notifications,
        activeCandidates,
        avgTimeToFillDays,
        openCalls,
      }),
    [territory, ai, notifications, activeCandidates, avgTimeToFillDays, openCalls],
  );

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading executive summary…</p>;
  }

  const briefing = display.briefing;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={typography.pageTitle}>Executive Summary</h1>
          <p className={`mt-1 ${typography.muted}`}>
            {display.dmNeedingHelp
              ? `${display.dmNeedingHelp} needs attention · ${display.opportunitiesAtRisk} opportunities at risk`
              : "Nationwide recruiting and workforce posture"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigateRecruitingTab({ tab: "ai-command-center" })}
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/15"
        >
          Open AI Command Center
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {display.healthGroups.map((group) => (
          <HealthGroupCard
            key={group.id}
            title={group.title}
            primaryLabel={group.primaryLabel}
            primaryValue={group.primaryValue}
            tone={group.tone}
            supporting={group.supporting}
          />
        ))}
      </section>

      <DataUnavailableSection title="AI Executive Briefing" hasData={Boolean(briefing)}>
        {briefing ? (
          <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">AI Executive Briefing</h2>
              <span className="text-[10px] text-zinc-500">{briefing.summary}</span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              {[briefing.topRisks, briefing.topWins, briefing.criticalAlerts].map((section) => (
                <div key={section.title} className="rounded-lg border border-zinc-800/60 bg-zinc-950/30 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{section.title}</p>
                  <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                    {section.items.slice(0, 3).map((item) => (
                      <li key={item} className="line-clamp-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-400/80">
                  Recommended Actions
                </p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                  {(ai?.insightsFeed ?? [])
                    .filter((row) => row.severity === "critical" || row.severity === "high")
                    .slice(0, 3)
                    .map((row) => (
                      <li key={row.id} className="line-clamp-2">
                        → {row.action}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}
      </DataUnavailableSection>

      <section className="grid gap-3 lg:grid-cols-3">
        {(
          [
            { key: "critical", label: "Critical", tone: "critical" as const, items: display.priorityAlerts.critical },
            { key: "high", label: "High", tone: "warning" as const, items: display.priorityAlerts.high },
            { key: "medium", label: "Medium", tone: "info" as const, items: display.priorityAlerts.medium },
          ] as const
        ).map((group) => {
          const styles = STATUS_TONE_STYLES[group.tone];
          return (
            <div
              key={group.key}
              className={`rounded-xl border bg-zinc-900/30 p-3 ${styles.border}`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{group.label}</h3>
                <span className="ml-auto text-sm font-semibold tabular-nums text-zinc-100">{group.items.length}</span>
              </div>
              {group.items.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-600">No active alerts</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {group.items.map((item) => (
                    <li key={item} className="line-clamp-1">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <CompactPanel title="Territory Health" empty={display.territoryHealth.length === 0}>
          <ul className="space-y-1.5 text-xs text-zinc-300">
            {display.territoryHealth.map((row) => (
              <li key={row.dmName} className="flex justify-between gap-2">
                <span>{row.dmName}</span>
                <span className="tabular-nums text-zinc-500">risk {row.coverageRisk}</span>
              </li>
            ))}
          </ul>
        </CompactPanel>
        <CompactPanel title="Recruiter Workload" empty={display.recruiterWorkload.length === 0}>
          <ul className="space-y-1.5 text-xs text-zinc-300">
            {display.recruiterWorkload.map((row) => (
              <li key={row.dmName} className="flex justify-between gap-2">
                <span>{row.dmName}</span>
                <span className="tabular-nums text-zinc-500">{row.score}</span>
              </li>
            ))}
          </ul>
        </CompactPanel>
        <CompactPanel title="Applicant Trend" empty={!display.applicantTrend}>
          {display.applicantTrend ? (
            <p className="text-sm text-zinc-300">
              {display.applicantTrend.direction === "up" ? "↑" : display.applicantTrend.direction === "down" ? "↓" : "→"}{" "}
              {display.applicantTrend.label}
            </p>
          ) : null}
        </CompactPanel>
        <CompactPanel title="Pipeline Summary" empty={!display.pipelineSummary}>
          {display.pipelineSummary ? (
            <div className="grid grid-cols-1 gap-1 text-xs text-zinc-300">
              <p>Hires (7d): {display.pipelineSummary.hired}</p>
            </div>
          ) : null}
        </CompactPanel>
      </section>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => navigateRecruitingTab({ tab: "notifications" })}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          View all alerts
        </button>
        <button
          type="button"
          onClick={() => navigateRecruitingTab({ tab: "territory-intelligence" })}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Territory detail
        </button>
      </div>
    </div>
  );
}

function CompactPanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  if (empty) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 px-3 py-3">
        <p className="text-xs font-medium text-zinc-400">{title}</p>
        <p className="mt-1 text-[11px] text-zinc-600">Data not available yet</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-3">
      <p className="text-xs font-medium text-zinc-400">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
