"use client";

import Link from "next/link";
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
    "rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4",
    isActive
      ? "border border-teal-500/40 bg-teal-500/10 text-teal-100 shadow-sm shadow-teal-950/20"
      : "border border-transparent text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200",
  ].join(" ");

const subTabButtonClass = (isActive: boolean) =>
  [
    "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
    isActive
      ? "border border-teal-500/40 bg-teal-500/10 text-teal-200 shadow-sm shadow-teal-950/20"
      : "border border-transparent text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200",
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
      className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div
          role="tablist"
          aria-label="Dashboard groups"
          className="flex flex-wrap gap-1"
        >
          {groups.map((group) => {
            const isActive = openGroupId === group.id;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectGroup(group.id)}
                className={groupButtonClass(isActive)}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label={`${groups.find((group) => group.id === openGroupId)?.label ?? "Dashboard"} sections`}
          className="-mb-px flex flex-wrap gap-1 sm:gap-1.5"
        >
          {subTabs.map((tab) => {
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
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={subTabButtonClass(false)}
                >
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
