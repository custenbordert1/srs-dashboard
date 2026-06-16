import type { ExecutiveAlert } from "@/lib/alerts/alert-types";

const STORAGE_KEY = "srs-dashboard:placement-alert-context:v1";

export type PlacementAlertNavigationContext = {
  alertId: string;
  opportunityId?: string;
  storeName?: string;
  projectName?: string;
  dmName?: string;
  highlightSection: "store-coverage" | "forecasts" | "recovery";
  zeroPipelineOnly?: boolean;
  forecastFilter?: "critical" | "at-risk" | "likely-to-fill" | "all";
};

export function buildPlacementContextFromAlert(alert: ExecutiveAlert): PlacementAlertNavigationContext {
  const opportunityId = alert.context?.opportunityId;
  const highlightSection =
    alert.category === "placement" && alert.id.includes("recovery")
      ? "recovery"
      : alert.recommendedAction === "placement-review" && alert.id.includes("forecast")
        ? "forecasts"
        : "store-coverage";

  return {
    alertId: alert.id,
    opportunityId,
    storeName: alert.context?.storeName,
    projectName: alert.context?.projectName ?? alert.title,
    dmName: alert.context?.dmName ?? alert.context?.territoryLabel,
    highlightSection,
    zeroPipelineOnly: alert.id.includes("zero-pipeline"),
    forecastFilter:
      alert.context?.forecastOutcome === "critical"
        ? "critical"
        : alert.context?.forecastOutcome === "at-risk"
          ? "at-risk"
          : highlightSection === "forecasts"
            ? "critical"
            : "all",
  };
}

export function writePlacementAlertContext(context: PlacementAlertNavigationContext): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

export function readPlacementAlertContext(): PlacementAlertNavigationContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlacementAlertNavigationContext;
  } catch {
    return null;
  }
}

export function clearPlacementAlertContext(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function applyPlacementAlertContextToStoreRows<T extends { opportunityId: string; store: string }>(
  rows: T[],
  context: PlacementAlertNavigationContext | null,
): T[] {
  if (!context) return rows;
  return rows.filter((row) => {
    if (context.opportunityId && row.opportunityId === context.opportunityId) return true;
    if (context.storeName && row.store === context.storeName) return true;
    return !context.opportunityId && !context.storeName;
  });
}
