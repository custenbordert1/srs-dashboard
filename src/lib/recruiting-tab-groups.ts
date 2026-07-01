import type { UserRole } from "@/lib/auth/types";
import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import { getRecruitingTabSource } from "@/lib/recruiting-tab-source-labels";

export type DashboardNavGroupId = "executive" | "operations" | "territory-field" | "admin-data";

export type DashboardNavTab = {
  id: DashboardTabId;
  label: string;
  href?: string;
};

export type DashboardNavGroup = {
  id: DashboardNavGroupId;
  label: string;
  tabIds: DashboardTabId[];
};

export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    id: "executive",
    label: "Executive",
    tabIds: [
      "executive-home",
      "executive-accountability",
      "executive-forecasting",
      "pipeline-intelligence",
      "workforce-intelligence",
      "recruiting-autopilot",
      "recruiting-autopilot-ops",
      "recruiting-execution",
      "placement-command-center",
    ],
  },
  {
    id: "operations",
    label: "Operations",
    tabIds: ["command-center", "recruiter-command-center", "recruiter-dashboard", "overview", "needs-attention", "candidates", "job-management", "approval-queue"],
  },
  {
    id: "territory-field",
    label: "Territory / Field",
    tabIds: ["dm-scorecards", "mel-projects", "workforce"],
  },
  {
    id: "admin-data",
    label: "Admin / Data",
    tabIds: ["live-sheet", "data-health", "recruiting-intelligence", "automation"],
  },
];

export const ALL_DASHBOARD_TAB_IDS: DashboardTabId[] = DASHBOARD_NAV_GROUPS.flatMap(
  (group) => group.tabIds,
);

const EXECUTIVE_ONLY_TAB_IDS = new Set<DashboardTabId>([
  "executive-home",
  "executive-accountability",
  "executive-forecasting",
  "workforce-intelligence",
  "recruiting-autopilot",
  "recruiting-autopilot-ops",
  "recruiting-execution",
  "placement-command-center",
]);

export function isDashboardTabId(value: string): value is DashboardTabId {
  return ALL_DASHBOARD_TAB_IDS.includes(value as DashboardTabId);
}

export function getDefaultDashboardTab(userRole?: UserRole): DashboardTabId {
  return userRole === "executive" ? "executive-home" : "command-center";
}

export function getDefaultNavGroupId(userRole?: UserRole): DashboardNavGroupId {
  return userRole === "executive" ? "executive" : "operations";
}

export function findNavGroupForTab(tabId: DashboardTabId): DashboardNavGroupId | null {
  for (const group of DASHBOARD_NAV_GROUPS) {
    if (group.tabIds.includes(tabId)) return group.id;
  }
  return null;
}

/** Tabs visible inside a group for the current role. */
export function getVisibleTabIdsForGroup(
  groupId: DashboardNavGroupId,
  userRole?: UserRole,
): DashboardTabId[] {
  const group = DASHBOARD_NAV_GROUPS.find((entry) => entry.id === groupId);
  if (!group) return [];

  if (groupId === "executive" && userRole !== "executive") {
    return group.tabIds.filter((tabId) => !EXECUTIVE_ONLY_TAB_IDS.has(tabId));
  }

  return group.tabIds;
}

/** Nav groups that contain at least one visible tab for the role. */
export function getDashboardNavGroups(userRole?: UserRole): DashboardNavGroup[] {
  return DASHBOARD_NAV_GROUPS.filter(
    (group) => getVisibleTabIdsForGroup(group.id, userRole).length > 0,
  );
}

export function getNavTabsForGroup(
  groupId: DashboardNavGroupId,
  userRole?: UserRole,
): DashboardNavTab[] {
  return getVisibleTabIdsForGroup(groupId, userRole).map((id) => {
    const meta = getRecruitingTabSource(id);
    return { id, label: meta.navLabel };
  });
}

export function getFirstVisibleTabInGroup(
  groupId: DashboardNavGroupId,
  userRole?: UserRole,
): DashboardTabId {
  const tabs = getVisibleTabIdsForGroup(groupId, userRole);
  return tabs[0] ?? getDefaultDashboardTab(userRole);
}
