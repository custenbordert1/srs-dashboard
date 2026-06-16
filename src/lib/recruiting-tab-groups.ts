import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import type { UserRole } from "@/lib/auth/types";

export type NavGroupId = "executive" | "operations" | "workforce" | "intelligence" | "admin";

export type NavGroup = {
  id: NavGroupId;
  label: string;
  primaryTabs: DashboardTabId[];
  secondaryTabs: DashboardTabId[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "executive",
    label: "Executive",
    primaryTabs: ["executive-morning-brief", "executive-alerts", "daily-action-plan", "recommendation-intelligence", "automation-control-center", "autopilot-recommendations", "predictive-territory-risk", "executive-operations-center", "executive-summary", "ai-command-center"],
    secondaryTabs: ["command-center", "overview", "needs-attention", "dm-scorecards"],
  },
  {
    id: "operations",
    label: "Operations",
    primaryTabs: ["candidates", "recruiter-productivity", "job-management", "territory-intelligence"],
    secondaryTabs: ["live-sheet", "automation"],
  },
  {
    id: "workforce",
    label: "Workforce",
    primaryTabs: ["placement-command-center", "workforce", "mel-projects", "routing-intelligence"],
    secondaryTabs: ["workforce-intelligence"],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    primaryTabs: ["notifications", "action-center", "recruiting-intelligence", "data-health"],
    secondaryTabs: [],
  },
  {
    id: "admin",
    label: "Admin",
    primaryTabs: ["system-admin"],
    secondaryTabs: [],
  },
];

const TAB_TO_GROUP = new Map<DashboardTabId, NavGroupId>();
for (const group of NAV_GROUPS) {
  for (const tabId of [...group.primaryTabs, ...group.secondaryTabs]) {
    TAB_TO_GROUP.set(tabId, group.id);
  }
}

export function resolveNavGroupForTab(tabId: DashboardTabId): NavGroupId {
  return TAB_TO_GROUP.get(tabId) ?? "executive";
}

export function visibleNavGroups(role?: UserRole): NavGroup[] {
  if (role === "admin" || role === "executive") return NAV_GROUPS;
  return NAV_GROUPS.filter((group) => group.id !== "admin");
}

export function allTabsInGroup(groupId: NavGroupId): DashboardTabId[] {
  const group = NAV_GROUPS.find((row) => row.id === groupId);
  if (!group) return [];
  return [...group.primaryTabs, ...group.secondaryTabs];
}
