import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import type { PlacementAlertNavigationContext } from "@/lib/alerts/placement-alert-navigation";
import { writePlacementAlertContext } from "@/lib/alerts/placement-alert-navigation";

export const RECRUITING_NAVIGATE_EVENT = "recruiting-navigate-tab";

export type RecruitingNavigateDetail = {
  tab: DashboardTabId;
  elementId?: string;
  placementContext?: PlacementAlertNavigationContext;
};

export function navigateRecruitingTab(detail: RecruitingNavigateDetail): void {
  if (typeof window === "undefined") return;
  if (detail.placementContext) {
    writePlacementAlertContext(detail.placementContext);
  }
  window.dispatchEvent(new CustomEvent<RecruitingNavigateDetail>(RECRUITING_NAVIGATE_EVENT, { detail }));
}
