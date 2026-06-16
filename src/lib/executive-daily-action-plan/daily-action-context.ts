import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";

const STORAGE_KEY = "srs-dashboard:daily-action-execution-context:v1";

export type DailyActionExecutionContext = {
  actionId: string;
  alertId: string;
  recommendationId: string;
  owner: string;
  tabId: DailyActionPlanItem["navigation"]["tabId"];
  elementId?: string;
  bucket: DailyActionPlanItem["bucket"];
  title: string;
};

export function buildDailyActionExecutionContext(item: DailyActionPlanItem): DailyActionExecutionContext {
  return {
    actionId: item.id,
    alertId: item.alertId,
    recommendationId: item.links.recommendationId,
    owner: item.owner,
    tabId: item.navigation.tabId,
    elementId: item.navigation.elementId,
    bucket: item.bucket,
    title: item.title,
  };
}

export function writeDailyActionExecutionContext(context: DailyActionExecutionContext): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

export function readDailyActionExecutionContext(): DailyActionExecutionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DailyActionExecutionContext;
  } catch {
    return null;
  }
}

export function clearDailyActionExecutionContext(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
