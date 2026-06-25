type DashboardFetchEvent = "start" | "success" | "error" | "timeout" | "partial";

export type DashboardFetchLogMeta = {
  route: string;
  label: string;
  ms?: number;
  status?: number;
  error?: string;
  partial?: boolean;
  detail?: string;
};

export function logDashboardFetch(event: DashboardFetchEvent, meta: DashboardFetchLogMeta): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[dashboard-fetch]", {
    event,
    route: meta.route,
    label: meta.label,
    ms: meta.ms,
    status: meta.status,
    error: meta.error,
    partial: meta.partial ?? false,
    detail: meta.detail,
    at: new Date().toISOString(),
  });
}
