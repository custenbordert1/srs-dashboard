import {
  P122_DEFAULT_PILOT_MAX_SENDS,
  type PilotConfig,
} from "@/lib/p122-controlled-live-paperwork-pilot/types";

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadPilotConfig(env: NodeJS.ProcessEnv = process.env): PilotConfig {
  const maxSendsRaw = env.AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS?.trim();
  const maxSends = maxSendsRaw ? Number(maxSendsRaw) : P122_DEFAULT_PILOT_MAX_SENDS;

  return {
    pilotEnabled: env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED === "true",
    liveModeEnabled: env.AUTONOMOUS_PAPERWORK_LIVE_MODE === "true",
    operatorGo: env.AUTONOMOUS_PAPERWORK_OPERATOR_GO === "true",
    maxSends: Number.isFinite(maxSends) && maxSends > 0 ? maxSends : P122_DEFAULT_PILOT_MAX_SENDS,
    allowlist: parseAllowlist(env.AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST),
  };
}
