"use client";

import Link from "next/link";
import { navGroupIcon, navTabIcon } from "@/components/recruiting/dashboard-nav-icons";
import { RecruitingSourceNavBadge } from "@/components/recruiting/recruiting-source-nav-badge";
import type { UserRole } from "@/lib/auth/types";
import {
  findNavGroupForTab,
  getDashboardNavGroups,
  getDefaultNavGroupId,
  getFirstVisibleTabInGroup,
  getNavTabsForGroup,
  type DashboardNavGroupId,
} from "@/lib/recruiting-tab-groups";
import {
  RECRUITING_TAB_SOURCE_BY_ID,
  type DashboardTabId,
} from "@/lib/recruiting-tab-source-labels";
import { useEffect, useState } from "react";

export type { DashboardTabId };

type DashboardTabNavProps = {
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
  userRole?: UserRole;
};

const groupButtonClass = (isActive: boolean) =>
  [
    "relative inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 sm:px-4",
    isActive
      ? "bg-teal-500/12 text-teal-50 ring-1 ring-inset ring-teal-500/30 after:absolute after:-bottom-3 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-teal-400/80"
      : "text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200",
  ].join(" ");

const subTabButtonClass = (isActive: boolean) =>
  [
    "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 sm:px-3.5",
    isActive
      ? "bg-teal-500/10 text-teal-100 ring-1 ring-inset ring-teal-500/25"
      : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300",
  ].join(" ");

export function DashboardTabNav({ activeTab, onTabChange, userRole }: DashboardTabNavProps) {
  const groups = getDashboardNavGroups(userRole);
  const activeGroupId = findNavGroupForTab(activeTab) ?? getDefaultNavGroupId(userRole);
  const [openGroupId, setOpenGroupId] = useState<DashboardNavGroupId>(activeGroupId);

  useEffect(() => {
    const next = findNavGroupForTab(activeTab);
    if (next) setOpenGroupId(next);
  }, [activeTab]);

  const subTabs = getNavTabsForGroup(openGroupId, userRole);

  const selectGroup = (groupId: DashboardNavGroupId) => {
    setOpenGroupId(groupId);
    const visible = getNavTabsForGroup(groupId, userRole);
    if (!visible.some((tab) => tab.id === activeTab)) {
      onTabChange(getFirstVisibleTabInGroup(groupId, userRole));
    }
  };

  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-0 z-40 border-b border-zinc-800/40 bg-zinc-950/95 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div role="tablist" aria-label="Dashboard groups" className="flex flex-wrap gap-1.5">
          {groups.map((group, index) => {
            const isActive = openGroupId === group.id;
            return (
              <span key={group.id} className="flex items-center gap-1.5">
                {index > 0 ? <span className="hidden h-4 w-px bg-zinc-800/80 sm:block" aria-hidden /> : null}
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => selectGroup(group.id)}
                  className={groupButtonClass(isActive)}
                >
                  <span className="text-zinc-400">{navGroupIcon(group.id)}</span>
                  {group.label}
                </button>
              </span>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label={`${groups.find((group) => group.id === openGroupId)?.label ?? "Dashboard"} sections`}
          className="mt-3 flex flex-wrap gap-1.5 pt-3"
        >
          {subTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const source = RECRUITING_TAB_SOURCE_BY_ID[tab.id];
            const icon = navTabIcon(tab.id);
            const tabLabel = (
              <span className="flex items-center gap-2">
                {icon ? <span className={isActive ? "text-teal-300/90" : "text-zinc-500"}>{icon}</span> : null}
                <span>{tab.label}</span>
                {isActive ? (
                  <RecruitingSourceNavBadge sourceTag={source.sourceTag} kind={source.kind} active />
                ) : null}
              </span>
            );

            if (tab.href) {
              return (
                <Link key={tab.id} href={tab.href} className={subTabButtonClass(false)}>
                  {icon ? <span className="text-zinc-500">{icon}</span> : null}
                  {tab.label}
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
                className={subTabButtonClass(isActive)}
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
