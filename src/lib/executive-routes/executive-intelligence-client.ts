import { fetchWithTimeout, isTimeoutError } from "@/lib/fetch-with-timeout";
import { EXECUTIVE_CLIENT_TIMEOUT_MS } from "@/lib/executive-routes/executive-route-profiling";
import type { ExecutiveIntelligenceRouteMeta } from "@/lib/executive-routes/executive-intelligence-route";

export type ExecutiveIntelligenceFetchResult<T> = {
  snapshot: T;
  meta: ExecutiveIntelligenceRouteMeta;
};

export type ExecutiveApiFetchResult<T> = {
  data: T;
  meta?: ExecutiveIntelligenceRouteMeta;
  timedOut: boolean;
};

export async function fetchExecutiveIntelligenceRoute<T>(
  path: string,
  options?: { force?: boolean; timeoutMs?: number },
): Promise<ExecutiveIntelligenceFetchResult<T>> {
  const result = await fetchExecutiveApiRoute<{ snapshot: T }>(path, options);
  if (!result.data.snapshot || !result.meta) {
    throw new Error(`Failed to load ${path}`);
  }
  return { snapshot: result.data.snapshot, meta: result.meta };
}

export async function fetchExecutiveApiRoute<T>(
  path: string,
  options?: { force?: boolean; timeoutMs?: number },
): Promise<ExecutiveApiFetchResult<T>> {
  const params = options?.force ? "?forceRefresh=1" : "";
  const timeoutMs = options?.timeoutMs ?? EXECUTIVE_CLIENT_TIMEOUT_MS;
  try {
    const response = await fetchWithTimeout(`${path}${params}`, {
      cache: "no-store",
      timeoutMs,
    });
    const payload = (await response.json()) as T & {
      ok?: boolean;
      error?: string;
      meta?: ExecutiveIntelligenceRouteMeta;
      routeMeta?: ExecutiveIntelligenceRouteMeta;
    };
    if (!response.ok || payload.ok === false) {
      throw new Error(
        "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Failed to load ${path}`,
      );
    }
    const routeMeta = payload.routeMeta ?? payload.meta;
    return {
      data: payload,
      meta: routeMeta,
      timedOut: Boolean(routeMeta?.timedOut),
    };
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(
        `Executive data timed out after ${Math.round(timeoutMs / 1000)}s. Partial cached data may still be loading — use Refresh to retry.`,
      );
    }
    throw error;
  }
}

export function scheduleExecutiveBackgroundRefresh(
  refresh: (force: boolean) => void | Promise<void>,
  meta?: ExecutiveIntelligenceRouteMeta,
): void {
  if (!meta?.deferred && !meta?.timedOut) return;
  window.setTimeout(() => {
    void refresh(true);
  }, 2500);
}

export { EXECUTIVE_CLIENT_TIMEOUT_MS };
