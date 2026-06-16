import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import type { PlacementAlertNavigationContext } from "@/lib/alerts/placement-alert-navigation";
import { writePlacementAlertContext } from "@/lib/alerts/placement-alert-navigation";
import type { SmartFilterId } from "@/lib/recruiter-action-center/types";

export const RECRUITING_NAVIGATE_EVENT = "recruiting-navigate-tab";

export const RECRUITER_ACTION_CENTER_ELEMENT_IDS = {
  root: "recruiter-action-center",
  /** Legacy alias used by alerts and productivity center */
  legacyQueue: "recruiter-action-queue",
  workNow: "recruiter-action-work-now",
  paperwork: "recruiter-action-paperwork",
  readyForMel: "recruiter-action-ready-mel",
  followUp: "recruiter-action-follow-up",
  productivity: "recruiter-action-productivity",
  workMode: "recruiter-action-work-mode",
} as const;

export type RecruiterActionCenterDeepLink =
  | { kind: "candidate"; candidateId: string }
  | { kind: "queue"; queue: "work-now" | "paperwork" | "ready-for-mel" | "follow-up" | "productivity" | "work-mode" };

export type RecruitingNavigateDetail = {
  tab: DashboardTabId;
  elementId?: string;
  placementContext?: PlacementAlertNavigationContext;
  candidateId?: string;
  actionCenterFilter?: SmartFilterId;
  actionCenterDeepLink?: RecruiterActionCenterDeepLink;
};

function elementIdForActionCenterDeepLink(link: RecruiterActionCenterDeepLink): string {
  switch (link.kind) {
    case "candidate":
      return RECRUITER_ACTION_CENTER_ELEMENT_IDS.root;
    case "queue":
      switch (link.queue) {
        case "work-now":
          return RECRUITER_ACTION_CENTER_ELEMENT_IDS.workNow;
        case "paperwork":
          return RECRUITER_ACTION_CENTER_ELEMENT_IDS.paperwork;
        case "ready-for-mel":
          return RECRUITER_ACTION_CENTER_ELEMENT_IDS.readyForMel;
        case "follow-up":
          return RECRUITER_ACTION_CENTER_ELEMENT_IDS.followUp;
        case "productivity":
          return RECRUITER_ACTION_CENTER_ELEMENT_IDS.productivity;
        case "work-mode":
          return RECRUITER_ACTION_CENTER_ELEMENT_IDS.workMode;
      }
  }
}

function filterForActionCenterDeepLink(link: RecruiterActionCenterDeepLink): SmartFilterId | undefined {
  if (link.kind === "candidate") return undefined;
  switch (link.queue) {
    case "work-now":
      return "work-now";
    case "paperwork":
      return "paperwork";
    case "ready-for-mel":
      return "ready-for-mel";
    case "follow-up":
      return "overdue";
    case "productivity":
    case "work-mode":
      return undefined;
  }
}

export function navigateRecruiterActionCenter(link: RecruiterActionCenterDeepLink): void {
  navigateRecruitingTab({
    tab: "candidates",
    elementId: elementIdForActionCenterDeepLink(link),
    actionCenterDeepLink: link,
    actionCenterFilter: filterForActionCenterDeepLink(link),
    candidateId: link.kind === "candidate" ? link.candidateId : undefined,
  });
}

export function navigateRecruitingTab(detail: RecruitingNavigateDetail): void {
  if (typeof window === "undefined") return;
  if (detail.placementContext) {
    writePlacementAlertContext(detail.placementContext);
  }
  if (detail.candidateId) {
    const url = new URL(window.location.href);
    url.searchParams.set("candidateId", detail.candidateId);
    window.history.replaceState(null, "", url.toString());
  }
  if (detail.actionCenterFilter) {
    const url = new URL(window.location.href);
    url.searchParams.set("actionCenterFilter", detail.actionCenterFilter);
    window.history.replaceState(null, "", url.toString());
  }
  window.dispatchEvent(new CustomEvent<RecruitingNavigateDetail>(RECRUITING_NAVIGATE_EVENT, { detail }));
}
