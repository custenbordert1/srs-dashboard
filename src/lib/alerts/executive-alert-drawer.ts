import type { ExecutiveAlert } from "@/lib/alerts/alert-types";

export function resolveExecutiveAlertDrawer(
  alerts: ExecutiveAlert[],
  selectedAlertId: string | null,
): ExecutiveAlert | null {
  if (!selectedAlertId) return null;
  return alerts.find((alert) => alert.id === selectedAlertId) ?? null;
}
