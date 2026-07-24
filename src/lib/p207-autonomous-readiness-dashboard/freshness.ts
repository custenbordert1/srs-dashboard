import type {
  P207Freshness,
  P207FreshnessState,
} from "@/lib/p207-autonomous-readiness-dashboard/types";
import {
  P207_FRESHNESS_DELAYED_MS,
  P207_FRESHNESS_LIVE_MS,
} from "@/lib/p207-autonomous-readiness-dashboard/types";

export function classifyP207Freshness(
  generatedAt: string,
  observedAt: string = new Date().toISOString(),
): P207Freshness {
  const ageMs = Math.max(
    0,
    new Date(observedAt).getTime() - new Date(generatedAt).getTime(),
  );
  let state: P207FreshnessState = "Live";
  if (ageMs > P207_FRESHNESS_DELAYED_MS) state = "Stale";
  else if (ageMs > P207_FRESHNESS_LIVE_MS) state = "Delayed";
  return { generatedAt, observedAt, ageMs, state };
}
