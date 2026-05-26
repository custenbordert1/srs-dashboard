export type RoutingIntelligenceLogEvent =
  | "build-start"
  | "build-complete"
  | "mel-load"
  | "clustering"
  | "route-pack-generation"
  | "workspace-build"
  | "cache-hit"
  | "cache-miss"
  | "cache-store"
  | "payload-size";

type RoutingLogFields = Record<string, string | number | boolean | undefined>;

export function logRoutingIntelligence(
  event: RoutingIntelligenceLogEvent,
  fields: RoutingLogFields = {},
): void {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  const suffix = parts.length > 0 ? ` ${parts.join(" ")}` : "";
  console.info(`[routing-intelligence] ${event}${suffix}`);
}
