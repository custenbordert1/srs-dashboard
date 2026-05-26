import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

export const RECRUITING_NAVIGATE_EVENT = "recruiting-navigate-tab";

export type RecruitingNavigateDetail = {
  tab: DashboardTabId;
  elementId?: string;
};

export function navigateRecruitingTab(detail: RecruitingNavigateDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RecruitingNavigateDetail>(RECRUITING_NAVIGATE_EVENT, { detail }));
}
