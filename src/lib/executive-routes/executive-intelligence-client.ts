import { FETCH_T4_INTELLIGENCE_MS, fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { ExecutiveIntelligenceRouteMeta } from "@/lib/executive-routes/executive-intelligence-route";

export type ExecutiveIntelligenceFetchResult<T> = {
  snapshot: T;
  meta: ExecutiveIntelligenceRouteMeta;
};

export async function fetchExecutiveIntelligenceRoute<T>(
  path: string,
  options?: { force?: boolean; timeoutMs?: number },
): Promise<ExecutiveIntelligenceFetchResult<T>> {
  const params = options?.force ? "?forceRefresh=1" : "";
  const response = await fetchWithTimeout(`${path}${params}`, {
    cache: "no-store",
    timeoutMs: options?.timeoutMs ?? FETCH_T4_INTELLIGENCE_MS,
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    snapshot?: T;
    meta?: ExecutiveIntelligenceRouteMeta;
  };
  if (!response.ok || !payload.ok || !payload.snapshot || !payload.meta) {
    throw new Error(payload.error ?? `Failed to load ${path}`);
  }
  return { snapshot: payload.snapshot, meta: payload.meta };
}

export function scheduleExecutiveBackgroundRefresh(
  refresh: (force: boolean) => void | Promise<void>,
  meta?: ExecutiveIntelligenceRouteMeta,
): void {
  if (!meta?.deferred) return;
  window.setTimeout(() => {
    void refresh(true);
  }, 2500);
}
