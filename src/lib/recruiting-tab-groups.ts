import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import { getRecruitingTabSource } from "@/lib/recruiting-tab-source-labels";

export type ExecutiveNavTab = {
  id: DashboardTabId;
  label: string;
  href?: string;
};

/** Leadership tabs shown first in primary nav for executive users. */
export const EXECUTIVE_PRIMARY_TAB_IDS: DashboardTabId[] = [
  "executive-accountability",
  "executive-forecasting",
];

export function getExecutiveNavTabs(): ExecutiveNavTab[] {
  return [
    ...EXECUTIVE_PRIMARY_TAB_IDS.map((id) => ({
      id,
      label: getRecruitingTabSource(id).navLabel,
    })),
    {
      id: "workforce-intelligence",
      label: getRecruitingTabSource("workforce-intelligence").navLabel,
      href: "/executive/workforce-intelligence",
    },
  ];
}
