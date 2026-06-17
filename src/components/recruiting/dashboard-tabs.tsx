"use client";

import Link from "next/link";
import { RecruitingSourceNavBadge } from "@/components/recruiting/recruiting-source-nav-badge";
import {
  getRecruitingTabSource,
  RECRUITING_TAB_SOURCE_BY_ID,
  type DashboardTabId,
} from "@/lib/recruiting-tab-source-labels";

export type { DashboardTabId };

export type DashboardTab = {
  id: DashboardTabId;
  label: string;
  href?: string;
};

/** Nav labels synced with `RECRUITING_TAB_SOURCE_BY_ID` — do not drift from source metadata. */
export const DASHBOARD_TABS: DashboardTab[] = (
  [
    "command-center",
    "overview",
    "needs-attention",
    "dm-scorecards",
    "live-sheet",
    "candidates",
    "mel-projects",
    "data-health",
    "recruiting-intelligence",
    "automation",
    "workforce",
    "job-management",
  ] as const
).map((id) => {
  const meta = getRecruitingTabSource(id);
  return { id, label: meta.navLabel };
});

export const EXECUTIVE_WORKFORCE_INTELLIGENCE_TAB: DashboardTab = {
  id: "workforce-intelligence",
  label: getRecruitingTabSource("workforce-intelligence").navLabel,
  href: "/executive/workforce-intelligence",
};

export const EXECUTIVE_RECRUITING_FORECAST_TAB: DashboardTab = {
  id: "executive-forecasting",
  label: getRecruitingTabSource("executive-forecasting").navLabel,
};

type DashboardTabNavProps = {
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
  extraTabs?: DashboardTab[];
};

const tabButtonClass = (isActive: boolean) =>
  [
    "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
    isActive
      ? "border border-teal-500/40 bg-teal-500/10 text-teal-200 shadow-sm shadow-teal-950/20"
      : "border border-transparent text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200",
  ].join(" ");

export function DashboardTabNav({ activeTab, onTabChange, extraTabs = [] }: DashboardTabNavProps) {
  const tabs = [...DASHBOARD_TABS, ...extraTabs];
  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="-mb-px flex gap-1 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const source = RECRUITING_TAB_SOURCE_BY_ID[tab.id];
            const tabLabel = (
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span>{tab.label}</span>
                <RecruitingSourceNavBadge
                  sourceTag={source.sourceTag}
                  kind={source.kind}
                  active={isActive}
                />
              </span>
            );
            if (tab.href) {
              return (
                <Link key={tab.id} href={tab.href} className={tabButtonClass(false)}>
                  {tabLabel}
                </Link>
              );
            }
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(tab.id)}
                className={tabButtonClass(isActive)}
              >
                {tabLabel}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
