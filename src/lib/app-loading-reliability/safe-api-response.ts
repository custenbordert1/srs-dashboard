import { withRequestTimeout } from "@/lib/app-loading-reliability/request-timeout";

export type SafeApiMeta = {
  degraded: boolean;
  degradedReason: string | null;
  timedOut: boolean;
  generatedAt: string;
  elapsedMs: number;
};

export type SafeApiResponse<T> = {
  ok: boolean;
  payload: T;
  meta: SafeApiMeta;
  warnings: string[];
};

export async function buildSafeApiResponse<T>(input: {
  label: string;
  timeoutMs: number;
  build: () => Promise<T>;
  fallback: () => T | Promise<T>;
  mapWarnings?: (payload: T) => string[];
}): Promise<SafeApiResponse<T>> {
  const generatedAt = new Date().toISOString();
  const fallback = await input.fallback();
  const result = await withRequestTimeout({
    label: input.label,
    promise: input.build(),
    timeoutMs: input.timeoutMs,
    fallback,
  });

  const degraded = result.timedOut || result.error != null;
  const warnings: string[] = [];
  if (result.timedOut) {
    warnings.push(`${input.label} timed out after ${input.timeoutMs}ms — returning degraded snapshot`);
  } else if (result.error) {
    warnings.push(result.error);
  }

  const extraWarnings = input.mapWarnings?.(result.value) ?? [];
  warnings.push(...extraWarnings);

  return {
    ok: !degraded,
    payload: result.value,
    meta: {
      degraded,
      degradedReason: result.error,
      timedOut: result.timedOut,
      generatedAt,
      elapsedMs: result.elapsedMs,
    },
    warnings,
  };
}
