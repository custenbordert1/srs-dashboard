const PERF_ENABLED =
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "development";

export function perfMark(label: string): void {
  if (!PERF_ENABLED || typeof performance === "undefined") return;
  performance.mark(label);
}

export function perfMeasure(name: string, startLabel: string, endLabel?: string): number | null {
  if (!PERF_ENABLED || typeof performance === "undefined") return null;
  try {
    const measure = performance.measure(name, startLabel, endLabel);
    const ms = Math.round(measure.duration * 10) / 10;
    console.info(`[perf] ${name}: ${ms}ms`);
    return ms;
  } catch {
    return null;
  } finally {
    performance.clearMarks(startLabel);
    if (endLabel) performance.clearMarks(endLabel);
    performance.clearMeasures(name);
  }
}

export async function perfAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!PERF_ENABLED) return fn();
  const start = `${name}-start`;
  perfMark(start);
  try {
    return await fn();
  } finally {
    perfMeasure(name, start);
  }
}
