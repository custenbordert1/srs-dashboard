"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getRecruitingTabSource,
  type DashboardTabId,
} from "@/lib/recruiting-tab-source-labels";
import {
  allTabsInGroup,
  resolveNavGroupForTab,
  visibleNavGroups,
  type NavGroupId,
} from "@/lib/recruiting-tab-groups";
import type { UserRole } from "@/lib/auth/types";

export type { DashboardTabId };

export type DashboardTab = {
  id: DashboardTabId;
  label: string;
  href?: string;
};

export const EXECUTIVE_WORKFORCE_INTELLIGENCE_TAB: DashboardTab = {
  id: "workforce-intelligence",
  label: getRecruitingTabSource("workforce-intelligence").navLabel,
  href: "/executive/workforce-intelligence",
};

const tabButtonClass = (isActive: boolean) =>
  [
    "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "border border-teal-500/40 bg-teal-500/10 text-teal-200"
      : "border border-transparent text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200",
  ].join(" ");

const groupButtonClass = (isActive: boolean) =>
  [
    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
    isActive
      ? "bg-zinc-800 text-zinc-100"
      : "text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-300",
  ].join(" ");

type DashboardTabNavProps = {
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
  userRole?: UserRole;
};

function tabLabel(tabId: DashboardTabId): string {
  if (tabId === "workforce-intelligence") return EXECUTIVE_WORKFORCE_INTELLIGENCE_TAB.label;
  return getRecruitingTabSource(tabId).navLabel;
}

function TabButton({
  tabId,
  activeTab,
  onTabChange,
  href,
  className,
}: {
  tabId: DashboardTabId;
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
  href?: string;
  className?: string;
}) {
  const isActive = activeTab === tabId;
  const label = tabLabel(tabId);
  const classes = [tabButtonClass(isActive), className].filter(Boolean).join(" ");
  if (href) {
    return (
      <Link href={href} className={classes} aria-current={isActive ? "page" : undefined}>
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onTabChange(tabId)}
      className={classes}
    >
      {label}
    </button>
  );
}

export function DashboardTabNav({ activeTab, onTabChange, userRole }: DashboardTabNavProps) {
  const groups = useMemo(() => visibleNavGroups(userRole), [userRole]);
  const [activeGroup, setActiveGroup] = useState<NavGroupId>(() => resolveNavGroupForTab(activeTab));
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  useEffect(() => {
    setActiveGroup(resolveNavGroupForTab(activeTab));
  }, [activeTab]);

  const currentGroup = groups.find((group) => group.id === activeGroup) ?? groups[0]!;
  const secondaryTabs = currentGroup.secondaryTabs.filter((tabId) => {
    if (tabId === "workforce-intelligence") {
      return userRole === "admin" || userRole === "executive";
    }
    if (tabId === "system-admin") return userRole === "admin" || userRole === "executive";
    return true;
  });

  const selectGroup = (groupId: NavGroupId) => {
    setActiveGroup(groupId);
    setSecondaryOpen(false);
    const tabs = allTabsInGroup(groupId);
    if (!tabs.includes(activeTab)) {
      const group = groups.find((row) => row.id === groupId);
      const nextTab = group?.primaryTabs[0];
      if (nextTab) onTabChange(nextTab);
    }
  };

  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => selectGroup(group.id)}
              className={groupButtonClass(activeGroup === group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="-mb-px flex items-center gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {currentGroup.primaryTabs.map((tabId) => (
            <TabButton key={tabId} tabId={tabId} activeTab={activeTab} onTabChange={onTabChange} />
          ))}
          {secondaryTabs.length > 0 ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setSecondaryOpen((open) => !open)}
                className={tabButtonClass(secondaryTabs.includes(activeTab))}
                aria-expanded={secondaryOpen}
              >
                More
              </button>
              {secondaryOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
                  {secondaryTabs.map((tabId) => (
                    <div key={tabId} className="px-1">
                      <TabButton
                        tabId={tabId}
                        activeTab={activeTab}
                        onTabChange={(next) => {
                          onTabChange(next);
                          setSecondaryOpen(false);
                        }}
                        href={tabId === "workforce-intelligence" ? EXECUTIVE_WORKFORCE_INTELLIGENCE_TAB.href : undefined}
                        className="w-full text-left"
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
