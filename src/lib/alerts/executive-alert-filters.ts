import type { AlertCategory, AlertSeverity, ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertStatus } from "@/lib/alerts/executive-alert-status-types";
import { DEFAULT_EXECUTIVE_ALERT_STATUS } from "@/lib/alerts/executive-alert-status-types";

export type ExecutiveAlertWithStatus = ExecutiveAlert & {
  status: ExecutiveAlertStatus;
};

export type ExecutiveAlertFilterState = {
  severity: AlertSeverity | "all";
  category: AlertCategory | "all";
  status: ExecutiveAlertStatus | "all";
  territory: string | "all";
};

export const DEFAULT_EXECUTIVE_ALERT_FILTERS: ExecutiveAlertFilterState = {
  severity: "all",
  category: "all",
  status: "all",
  territory: "all",
};

export function mergeAlertStatuses(
  alerts: ExecutiveAlert[],
  overlays: Array<{ alertId: string; status: ExecutiveAlertStatus; snoozedUntil?: string | null }>,
  referenceMs = Date.now(),
): ExecutiveAlertWithStatus[] {
  const overlayById = new Map(overlays.map((row) => [row.alertId, row]));
  return alerts.map((alert) => {
    const overlay = overlayById.get(alert.id);
    let status = overlay?.status ?? DEFAULT_EXECUTIVE_ALERT_STATUS;
    if (status === "snoozed" && overlay?.snoozedUntil) {
      const until = Date.parse(overlay.snoozedUntil);
      if (!Number.isNaN(until) && until <= referenceMs) {
        status = "new";
      }
    }
    return { ...alert, status };
  });
}

export function filterExecutiveAlerts(
  alerts: ExecutiveAlertWithStatus[],
  filters: ExecutiveAlertFilterState,
): ExecutiveAlertWithStatus[] {
  return alerts.filter((alert) => {
    if (filters.severity !== "all" && alert.severity !== filters.severity) return false;
    if (filters.category !== "all" && alert.category !== filters.category) return false;
    if (filters.status !== "all" && alert.status !== filters.status) return false;
    if (filters.territory !== "all") {
      const territory =
        alert.context?.dmName ??
        alert.context?.territoryLabel ??
        alert.context?.state ??
        "";
      if (territory !== filters.territory) return false;
    }
    return true;
  });
}

export function listExecutiveAlertTerritories(alerts: ExecutiveAlert[]): string[] {
  const values = new Set<string>();
  for (const alert of alerts) {
    const territory =
      alert.context?.dmName ?? alert.context?.territoryLabel ?? alert.context?.state;
    if (territory) values.add(territory);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}
